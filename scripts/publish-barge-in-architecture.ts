import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";

import { db, pool } from "@/lib/db";
import {
  auditLogs,
  categories,
  postRevisions,
  posts,
  postTags,
  tags,
  users,
} from "@/lib/db/schema";
import { renderMarkdown, rendererVersion } from "@/lib/markdown/render";
import { normalizeSlug } from "@/lib/posts/slug";

const article = {
  slug: "barge-in-realtime-voice-architecture",
  title: "让数字人真正“听得见”：我的 Barge-in 实时语音架构",
  summary:
    "从本地麦克风、WebRTC AEC3 和 DeepFilterNet3，到唤醒、双 VAD、双 ASR 与响应撤销：拆解一套纯 CPU 数字人实时语音打断系统。",
  seoTitle: "Barge-in 实时语音架构：数字人如何边说边听",
  seoDescription:
    "介绍一套数字人 Barge-in 实时语音架构，涵盖 AEC3、降噪、唤醒、声纹、VAD、流式与离线 ASR、会话状态机和响应撤销。",
  cover: "/media/covers/19cebdfc-afdd-41af-b8ea-54d8c7dd856e.png",
  categorySlug: "speech-recognition",
  tagNames: ["Barge-in", "实时音频", "语音识别", "数字人", "系统架构"],
  source: path.join(
    process.cwd(),
    "docs",
    "articles",
    "barge-in-architecture.md",
  ),
};

async function main() {
  const contentMd = await readFile(article.source, "utf8");
  const contentHtml = await renderMarkdown(contentMd);

  const [author] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
    .limit(1);
  if (!author) throw new Error("No active admin author is available.");

  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.slug, article.categorySlug),
        isNull(categories.deletedAt),
      ),
    )
    .limit(1);
  if (!category) {
    throw new Error(`Category not found: ${article.categorySlug}`);
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.slug, article.slug), isNull(posts.deletedAt)))
      .limit(1);

    const nextRevision = existing ? existing.revision + 1 : 1;
    let postId: string;

    if (existing) {
      postId = existing.id;
      await tx
        .update(posts)
        .set({
          title: article.title,
          summary: article.summary,
          contentMd,
          contentHtml,
          rendererVersion,
          cover: article.cover,
          status: "published",
          categoryId: category.id,
          revision: nextRevision,
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription,
          publishedAt: existing.publishedAt ?? new Date(),
          scheduledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, existing.id));
    } else {
      const [created] = await tx
        .insert(posts)
        .values({
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          contentMd,
          contentHtml,
          rendererVersion,
          cover: article.cover,
          status: "published",
          pinned: false,
          authorId: author.id,
          categoryId: category.id,
          revision: nextRevision,
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription,
          publishedAt: new Date(),
        })
        .returning({ id: posts.id });
      postId = created.id;
    }

    await tx.delete(postTags).where(eq(postTags.postId, postId));
    for (const name of article.tagNames) {
      const slug = normalizeSlug(name);
      let [tag] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.slug, slug), isNull(tags.deletedAt)))
        .limit(1);

      if (!tag) {
        [tag] = await tx
          .insert(tags)
          .values({ name, slug })
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
      if (!tag) throw new Error(`Unable to resolve tag: ${name}`);
      await tx
        .insert(postTags)
        .values({ postId, tagId: tag.id })
        .onConflictDoNothing();
    }

    await tx.insert(postRevisions).values({
      postId,
      revision: nextRevision,
      title: article.title,
      summary: article.summary,
      contentMd,
      status: "published",
      isPublishedVersion: true,
      createdBy: author.id,
    });

    await tx.insert(auditLogs).values({
      actorId: author.id,
      action: existing ? "post.update" : "post.create",
      targetType: "post",
      targetId: postId,
      before: existing
        ? {
            title: existing.title,
            status: existing.status,
            revision: existing.revision,
          }
        : null,
      after: {
        slug: article.slug,
        title: article.title,
        status: "published",
        revision: nextRevision,
        cover: article.cover,
        tags: article.tagNames,
        source: "content-script",
      },
    });

    return {
      id: postId,
      revision: nextRevision,
      operation: existing ? "updated" : "created",
    };
  });

  console.log(
    `[content:publish-barge-in] ${result.operation} ${article.slug} `
      + `(id=${result.id}, revision=${result.revision}, renderer=v${rendererVersion})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
