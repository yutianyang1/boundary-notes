"use server";

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { extractClientIp } from "@/lib/auth/device";
import { requireUser } from "@/lib/auth/permissions";
import { allowCommentRequest } from "@/lib/comments/rate-limit";
import { canDeleteComment, resolveCommentDepth } from "@/lib/comments/policy";
import { db } from "@/lib/db";
import { auditLogs, comments, posts } from "@/lib/db/schema";
import { areCommentsEnabled } from "@/lib/features";

export type CommentActionState = { error?: string; success?: boolean };

const createSchema = z.object({
  postId: z.string().uuid(),
  slug: z.string().trim().min(1).max(240),
  parentId: z.string().uuid().optional(),
  content: z.string().trim().min(1, "评论不能为空。").max(2_000, "评论最多 2000 个字符。"),
});

export async function createCommentAction(_state: CommentActionState, formData: FormData): Promise<CommentActionState> {
  if (!areCommentsEnabled()) return { error: "评论功能当前未开放。" };
  let user;
  try {
    user = await requireUser();
  } catch {
    return { error: "请先登录后再发表评论。" };
  }
  const parsed = createSchema.safeParse({
    postId: formData.get("postId"),
    slug: formData.get("slug"),
    parentId: formData.get("parentId") || undefined,
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "评论内容不符合要求。" };
  if (!await allowCommentRequest(user.id)) return { error: "发表得太快了，请稍后再试。" };

  const { postId, slug, parentId, content } = parsed.data;
  const [post] = await db.select({ id: posts.id }).from(posts).where(and(
    eq(posts.id, postId),
    eq(posts.slug, slug),
    isNull(posts.deletedAt),
    or(eq(posts.status, "published"), and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql<Date>`now()`))),
  )).limit(1);
  if (!post) return { error: "文章不存在或尚未发布。" };

  const parent = parentId ? (await db.select({ postId: comments.postId, depth: comments.depth })
    .from(comments).where(and(eq(comments.id, parentId), eq(comments.status, "approved"), isNull(comments.deletedAt))).limit(1))[0] ?? null : null;
  if (parentId && !parent) return { error: "要回复的评论不存在。" };
  let depth: number;
  try {
    depth = resolveCommentDepth(parent, postId);
  } catch (error) {
    return { error: error instanceof Error && error.message.includes("MISMATCH") ? "不能跨文章回复评论。" : "评论最多支持一层回复。" };
  }
  const requestHeaders = await headers();
  await db.insert(comments).values({
    postId,
    parentId,
    userId: user.id,
    depth,
    content,
    status: "approved",
    ip: extractClientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
  });
  revalidatePath(`/posts/${slug}`);
  return { success: true };
}

const deleteSchema = z.object({ commentId: z.string().uuid(), slug: z.string().trim().min(1).max(240) });

export async function deleteCommentAction(_state: CommentActionState, formData: FormData): Promise<CommentActionState> {
  if (!areCommentsEnabled()) return { error: "评论功能当前未开放。" };
  let user;
  try {
    user = await requireUser();
  } catch {
    return { error: "请先登录。" };
  }
  const parsed = deleteSchema.safeParse({ commentId: formData.get("commentId"), slug: formData.get("slug") });
  if (!parsed.success) return { error: "请求参数无效。" };
  const [existing] = await db.select({ id: comments.id, userId: comments.userId, deletedAt: comments.deletedAt })
    .from(comments).where(eq(comments.id, parsed.data.commentId)).limit(1);
  if (!existing) return { error: "评论不存在。" };
  if (!canDeleteComment(user, existing.userId)) return { error: "没有权限删除这条评论。" };
  if (existing.deletedAt) return { success: true };
  const requestHeaders = await headers();
  await db.transaction(async (tx) => {
    await tx.update(comments).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(comments.id, existing.id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "comment.delete",
      targetType: "comment",
      targetId: existing.id,
      before: { userId: existing.userId },
      ip: extractClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    });
  });
  revalidatePath(`/posts/${parsed.data.slug}`);
  return { success: true };
}
