"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { extractClientIp } from "@/lib/auth/device";
import { requireEditor } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { auditLogs, comments, posts } from "@/lib/db/schema";
import { areCommentsEnabled } from "@/lib/features";

const inputSchema = z.object({ id: z.string().uuid() });

export async function markCommentSpamAction(formData: FormData) {
  if (!areCommentsEnabled()) throw new Error("评论功能当前未开放");
  const user = await requireEditor();
  const { id } = inputSchema.parse({ id: formData.get("id") });
  const [existing] = await db.select({ status: comments.status, postId: comments.postId, slug: posts.slug })
    .from(comments).innerJoin(posts, eq(comments.postId, posts.id)).where(eq(comments.id, id)).limit(1);
  if (!existing) return;
  const requestHeaders = await headers();
  await db.transaction(async (tx) => {
    await tx.update(comments).set({ status: "spam", updatedAt: new Date() }).where(eq(comments.id, id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "comment.spam",
      targetType: "comment",
      targetId: id,
      before: { status: existing.status },
      after: { status: "spam" },
      ip: extractClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    });
  });
  revalidatePath(`/posts/${existing.slug}`);
  revalidatePath("/admin/comments");
}

export async function deleteCommentAdminAction(formData: FormData) {
  if (!areCommentsEnabled()) throw new Error("评论功能当前未开放");
  const user = await requireEditor();
  const { id } = inputSchema.parse({ id: formData.get("id") });
  const [existing] = await db.select({ deletedAt: comments.deletedAt, postId: comments.postId, slug: posts.slug })
    .from(comments).innerJoin(posts, eq(comments.postId, posts.id)).where(eq(comments.id, id)).limit(1);
  if (!existing || existing.deletedAt) return;
  const requestHeaders = await headers();
  await db.transaction(async (tx) => {
    await tx.update(comments).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(comments.id, id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "comment.delete",
      targetType: "comment",
      targetId: id,
      ip: extractClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    });
  });
  revalidatePath(`/posts/${existing.slug}`);
  revalidatePath("/admin/comments");
}
