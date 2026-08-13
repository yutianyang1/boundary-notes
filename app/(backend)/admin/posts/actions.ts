"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManagePost, requireStaff } from "@/lib/auth/permissions";
import { invalidatePostAfterMutation } from "@/lib/cache/invalidate";
import { db } from "@/lib/db";
import { auditLogs, postRedirects, postRevisions, posts, postTags, series, tags } from "@/lib/db/schema";
import { renderMarkdown, rendererVersion } from "@/lib/markdown/render";
import { normalizeSlug } from "@/lib/posts/slug";
import { isManagedCoverUrl } from "@/lib/uploads/cover";
import { enqueuePostBroadcast } from "@/lib/subscribe/service";

export type PostActionState = { error?: string };

const postInputSchema = z.object({
  id: z.string().uuid().optional(),
  revision: z.coerce.number().int().positive().default(1),
  title: z.string().trim().min(1, "标题不能为空").max(240),
  slug: z.string().transform(normalizeSlug).pipe(z.string().min(1, "Slug 不能为空").max(240)),
  summary: z.string().trim().max(1_000),
  contentMd: z.string().max(1_000_000),
  status: z.enum(["draft", "in_review", "scheduled", "published", "archived"]),
  pinned: z.string().optional().transform((value) => value === "on"),
  publishAt: z.string().optional(),
  cover: z.string().trim().max(300).optional().default(""),
  tags: z.string().trim().max(500).optional().default(""),
  seriesId: z.string().trim().optional().default(""),
  seriesOrder: z.string().trim().optional().default(""),
});

function parseTagNames(value: string) {
  const names = [...new Set(
    value
      .split(/[,，、;\n]+/)
      .map((name) => name.normalize("NFKC").trim())
      .filter(Boolean),
  )];
  if (names.length > 8) throw new Error("每篇文章最多设置 8 个标签。");
  if (names.some((name) => name.length > 40)) throw new Error("单个标签不能超过 40 个字符。");
  if (names.some((name) => !normalizeSlug(name))) throw new Error("标签必须包含字母、数字或汉字。");
  return names;
}

function publicationDates(status: z.infer<typeof postInputSchema>["status"], rawDate?: string) {
  if (status === "published") return { publishedAt: rawDate ? new Date(rawDate) : new Date(), scheduledAt: null };
  if (status === "scheduled") {
    if (!rawDate) throw new Error("定时发布必须设置发布时间");
    const publishedAt = new Date(rawDate);
    if (Number.isNaN(publishedAt.getTime())) throw new Error("发布时间格式不正确");
    return { publishedAt, scheduledAt: new Date() };
  }
  return { publishedAt: null, scheduledAt: null };
}

export async function savePostAction(_: PostActionState, formData: FormData): Promise<PostActionState> {
  const user = await requireStaff();
  const parsed = postInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "表单内容不正确" };

  const input = parsed.data;
  let tagNames: string[];
  try {
    tagNames = parseTagNames(input.tags);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "标签格式不正确" };
  }
  if (input.cover && !isManagedCoverUrl(input.cover)) {
    return { error: "封面地址不合法，请重新上传。" };
  }
  const canPin = user.role === "editor" || user.role === "admin";
  if (user.role === "author" && ["published", "scheduled", "archived"].includes(input.status)) {
    return { error: "作者只能保存草稿或提交审核。" };
  }

  let dates: ReturnType<typeof publicationDates>;
  try {
    dates = publicationDates(input.status, input.publishAt);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "发布时间不正确" };
  }

  let contentHtml: string;
  try {
    contentHtml = await renderMarkdown(input.contentMd);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Markdown 渲染失败" };
  }
  let savedId: string;
  let oldSlug: string | null = null;
  let oldTagSlugs: string[] = [];
  let oldSeriesSlug: string | null = null;
  let newSeriesSlug: string | null = null;
  const newTagSlugs = tagNames.map(normalizeSlug);
  const selectedSeriesId = input.seriesId || null;
  const selectedSeriesOrder = input.seriesOrder ? Number(input.seriesOrder) : null;
  if (selectedSeriesId && !z.string().uuid().safeParse(selectedSeriesId).success) {
    return { error: "所选系列不正确。" };
  }
  if (
    selectedSeriesId
    && (!Number.isInteger(selectedSeriesOrder) || selectedSeriesOrder === null || selectedSeriesOrder < 1)
  ) {
    return { error: "系列内序号必须是从 1 开始的整数。" };
  }

  try {
    savedId = await db.transaction(async (tx) => {
      async function syncPostTags(postId: string) {
        await tx.delete(postTags).where(eq(postTags.postId, postId));
        for (let index = 0; index < tagNames.length; index += 1) {
          const slug = newTagSlugs[index];
          let [tag] = await tx
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
            .limit(1);
          if (!tag) {
            [tag] = await tx
              .insert(tags)
              .values({ slug, name: tagNames[index] })
              .onConflictDoNothing()
              .returning({ id: tags.id });
          }
          if (!tag) {
            [tag] = await tx
              .select({ id: tags.id })
              .from(tags)
              .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
              .limit(1);
          }
          if (!tag) throw new Error(`无法创建标签“${tagNames[index]}”。`);
          await tx.insert(postTags).values({ postId, tagId: tag.id }).onConflictDoNothing();
        }
      }

      async function resolveSelectedSeries() {
        if (!selectedSeriesId) return null;
        const [selected] = await tx
          .select({ id: series.id, slug: series.slug })
          .from(series)
          .where(and(eq(series.id, selectedSeriesId), isNull(series.deletedAt)))
          .limit(1);
        if (!selected) throw new Error("所选系列不存在或已删除。");
        newSeriesSlug = selected.slug;
        return selected.id;
      }

      const resolvedSeriesId = await resolveSelectedSeries();

      if (!input.id) {
        const [created] = await tx.insert(posts).values({
          slug: input.slug,
          title: input.title,
          summary: input.summary,
          contentMd: input.contentMd,
          contentHtml,
          rendererVersion,
          cover: input.cover || null,
          status: input.status,
          pinned: canPin && input.pinned,
          authorId: user.id,
          seriesId: resolvedSeriesId,
          seriesOrder: resolvedSeriesId ? selectedSeriesOrder : null,
          revision: 1,
          ...dates,
        }).returning({ id: posts.id });

        await syncPostTags(created.id);
        await tx.insert(postRevisions).values({
          postId: created.id,
          revision: 1,
          title: input.title,
          summary: input.summary,
          contentMd: input.contentMd,
          status: input.status,
          seriesId: resolvedSeriesId,
          seriesOrder: resolvedSeriesId ? selectedSeriesOrder : null,
          isPublishedVersion: input.status === "published",
          createdBy: user.id,
        });
        await tx.insert(auditLogs).values({
          actorId: user.id,
          action: "post.create",
          targetType: "post",
          targetId: created.id,
          after: {
            slug: input.slug,
            title: input.title,
            status: input.status,
            pinned: canPin && input.pinned,
            cover: input.cover || null,
            tags: tagNames,
            seriesId: resolvedSeriesId,
            seriesOrder: resolvedSeriesId ? selectedSeriesOrder : null,
          },
        });
        if (input.status === "published") await enqueuePostBroadcast(tx, created.id);
        return created.id;
      }

      const [existing] = await tx.select().from(posts).where(and(eq(posts.id, input.id), isNull(posts.deletedAt))).limit(1);
      if (!existing) throw new Error("文章不存在或已删除");
      if (!canManagePost(user, existing.authorId)) throw new Error("没有权限编辑这篇文章");
      oldSlug = existing.slug;
      if (existing.seriesId) {
        const [oldSeries] = await tx
          .select({ slug: series.slug })
          .from(series)
          .where(eq(series.id, existing.seriesId))
          .limit(1);
        oldSeriesSlug = oldSeries?.slug ?? null;
      }
      oldTagSlugs = (await tx
        .select({ slug: tags.slug })
        .from(postTags)
        .innerJoin(tags, eq(postTags.tagId, tags.id))
        .where(eq(postTags.postId, input.id))).map((tag) => tag.slug);

      const nextRevision = input.revision + 1;
      const [updated] = await tx.update(posts).set({
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        contentMd: input.contentMd,
        contentHtml,
        rendererVersion,
        cover: input.cover || null,
        status: input.status,
        pinned: canPin ? input.pinned : existing.pinned,
        seriesId: resolvedSeriesId,
        seriesOrder: resolvedSeriesId ? selectedSeriesOrder : null,
        revision: nextRevision,
        updatedAt: new Date(),
        ...dates,
      }).where(and(eq(posts.id, input.id), eq(posts.revision, input.revision), isNull(posts.deletedAt))).returning({ id: posts.id });

      if (!updated) throw new Error("文章已被其他人修改，请刷新后再编辑");
      if (existing.slug !== input.slug) {
        await tx.insert(postRedirects).values({ oldSlug: existing.slug, postId: input.id }).onConflictDoNothing();
      }
      await syncPostTags(input.id);
      await tx.insert(postRevisions).values({
        postId: input.id,
        revision: nextRevision,
        title: input.title,
        summary: input.summary,
        contentMd: input.contentMd,
        status: input.status,
        seriesId: resolvedSeriesId,
        seriesOrder: resolvedSeriesId ? selectedSeriesOrder : null,
        isPublishedVersion: input.status === "published",
        createdBy: user.id,
      });
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "post.update",
        targetType: "post",
        targetId: input.id,
        before: {
          slug: existing.slug,
          title: existing.title,
          status: existing.status,
          pinned: existing.pinned,
          revision: existing.revision,
          cover: existing.cover,
          tags: oldTagSlugs,
          seriesId: existing.seriesId,
          seriesOrder: existing.seriesOrder,
        },
        after: {
          slug: input.slug,
          title: input.title,
          status: input.status,
          pinned: canPin ? input.pinned : existing.pinned,
          revision: nextRevision,
          cover: input.cover || null,
          tags: tagNames,
          seriesId: resolvedSeriesId,
          seriesOrder: resolvedSeriesId ? selectedSeriesOrder : null,
        },
      });
      if (input.status === "published") await enqueuePostBroadcast(tx, input.id);
      return input.id;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    if (message.includes("posts_slug_active_unique")) return { error: "这个 Slug 已被其他文章使用。" };
    return { error: message };
  }

  const affectedTags = [...new Set([...oldTagSlugs, ...newTagSlugs])];
  const affectedSeries: string[] = [];
  if (oldSeriesSlug) affectedSeries.push(oldSeriesSlug);
  if (newSeriesSlug && !affectedSeries.includes(newSeriesSlug)) affectedSeries.push(newSeriesSlug);
  await invalidatePostAfterMutation(input.slug, affectedTags, affectedSeries);
  if (oldSlug && oldSlug !== input.slug) await invalidatePostAfterMutation(oldSlug, affectedTags, affectedSeries);
  revalidatePath("/admin/posts");
  redirect(`/admin/posts/${savedId}?saved=1`);
}

export async function deletePostAction(formData: FormData) {
  const user = await requireStaff();
  const id = z.string().uuid().parse(formData.get("id"));

  const [existing] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!existing || !canManagePost(user, existing.authorId)) throw new Error("没有权限删除这篇文章");
  const tagSlugs = (await db
    .select({ slug: tags.slug })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, id))).map((tag) => tag.slug);
  const [seriesRow] = existing.seriesId
    ? await db.select({ slug: series.slug }).from(series).where(eq(series.id, existing.seriesId)).limit(1)
    : [];

  await db.transaction(async (tx) => {
    await tx.update(posts).set({ deletedAt: new Date(), updatedAt: new Date(), revision: sql`${posts.revision} + 1` }).where(eq(posts.id, id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "post.delete",
      targetType: "post",
      targetId: id,
      before: { slug: existing.slug, title: existing.title, status: existing.status },
    });
  });

  await invalidatePostAfterMutation(existing.slug, tagSlugs, seriesRow ? [seriesRow.slug] : []);
  revalidatePath("/admin/posts");
  redirect("/admin/posts");
}

export async function renderMarkdownPreview(markdown: string) {
  await requireStaff();
  return renderMarkdown(markdown.slice(0, 1_000_000));
}
