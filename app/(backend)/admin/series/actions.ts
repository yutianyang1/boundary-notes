"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/permissions";
import { cacheTags } from "@/lib/cache/tags";
import { db } from "@/lib/db";
import { auditLogs, series } from "@/lib/db/schema";
import { normalizeSlug } from "@/lib/posts/slug";
import { isManagedCoverUrl } from "@/lib/uploads/cover";

export type SeriesActionState = { error?: string };

const seriesInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "系列名称不能为空").max(120),
  // 英文名与英文描述留空即回退到中文，因此不做必填校验。
  nameEn: z.string().trim().max(120).optional().default(""),
  slug: z.string().transform(normalizeSlug).pipe(z.string().min(1, "Slug 不能为空").max(180)),
  description: z.string().trim().max(5_000).optional().default(""),
  descriptionEn: z.string().trim().max(5_000).optional().default(""),
  cover: z.string().trim().max(300).optional().default(""),
});

function invalidateSeries(...slugs: Array<string | null | undefined>) {
  updateTag(cacheTags.posts);
  for (const slug of new Set(slugs.filter((value): value is string => Boolean(value)))) {
    updateTag(cacheTags.series(slug));
  }
  revalidatePath("/admin/series");
  revalidatePath("/series");
}

export async function saveSeriesAction(
  _: SeriesActionState,
  formData: FormData,
): Promise<SeriesActionState> {
  const user = await requireStaff();
  const parsed = seriesInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "系列内容不正确" };
  }
  const input = parsed.data;
  if (input.cover && !isManagedCoverUrl(input.cover)) {
    return { error: "封面地址不合法，请重新上传。" };
  }

  let previousSlug: string | null = null;
  try {
    await db.transaction(async (tx) => {
      if (!input.id) {
        const [created] = await tx
          .insert(series)
          .values({
            name: input.name,
            nameEn: input.nameEn || null,
            slug: input.slug,
            description: input.description || null,
            descriptionEn: input.descriptionEn || null,
            cover: input.cover || null,
          })
          .returning({ id: series.id });
        await tx.insert(auditLogs).values({
          actorId: user.id,
          action: "series.create",
          targetType: "series",
          targetId: created.id,
          after: {
            name: input.name,
            nameEn: input.nameEn || null,
            slug: input.slug,
            description: input.description || null,
            descriptionEn: input.descriptionEn || null,
            cover: input.cover || null,
          },
        });
        return;
      }

      const [existing] = await tx
        .select()
        .from(series)
        .where(and(eq(series.id, input.id), isNull(series.deletedAt)))
        .limit(1);
      if (!existing) throw new Error("系列不存在或已删除");
      previousSlug = existing.slug;
      await tx
        .update(series)
        .set({
          name: input.name,
          nameEn: input.nameEn || null,
          slug: input.slug,
          description: input.description || null,
          cover: input.cover || null,
          updatedAt: new Date(),
        })
        .where(eq(series.id, input.id));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "series.update",
        targetType: "series",
        targetId: input.id,
        before: {
          name: existing.name,
          slug: existing.slug,
          description: existing.description,
          cover: existing.cover,
        },
        after: {
          name: input.name,
          nameEn: input.nameEn || null,
          slug: input.slug,
          description: input.description || null,
          cover: input.cover || null,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    if (message.includes("series_slug_active_unique")) {
      return { error: "这个 Slug 已被其他系列使用。" };
    }
    return { error: message };
  }

  invalidateSeries(previousSlug, input.slug);
  redirect("/admin/series?saved=1");
}

export async function deleteSeriesAction(formData: FormData) {
  const user = await requireStaff();
  const id = z.string().uuid().parse(formData.get("id"));
  const [existing] = await db
    .select()
    .from(series)
    .where(and(eq(series.id, id), isNull(series.deletedAt)))
    .limit(1);
  if (!existing) throw new Error("系列不存在或已删除");

  await db.transaction(async (tx) => {
    await tx
      .update(series)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(series.id, id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "series.delete",
      targetType: "series",
      targetId: id,
      before: {
        name: existing.name,
        slug: existing.slug,
        description: existing.description,
        cover: existing.cover,
      },
    });
  });

  invalidateSeries(existing.slug);
  redirect("/admin/series?deleted=1");
}
