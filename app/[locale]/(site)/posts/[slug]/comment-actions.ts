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

/** 返回字典 key 而非文案，翻译交给 UI。 */
export type CommentErrorKey =
  | "errors.closed"
  | "errors.signInRequired"
  | "errors.mustSignIn"
  | "errors.tooFast"
  | "errors.invalidRequest"
  | "errors.empty"
  | "errors.tooLong"
  | "errors.invalidContent"
  | "errors.parentMissing"
  | "errors.crossPost"
  | "errors.oneLevel"
  | "errors.notFound"
  | "errors.noPermission"
  | "errors.postMissing";

export type CommentActionState = { errorKey?: CommentErrorKey; success?: boolean };

const createSchema = z.object({
  postId: z.string().uuid(),
  slug: z.string().trim().min(1).max(240),
  parentId: z.string().uuid().optional(),
  // 具体是空还是超长由下面的分支区分，zod 只做校验不产出文案。
  content: z.string().trim().min(1).max(2_000),
});

export async function createCommentAction(_state: CommentActionState, formData: FormData): Promise<CommentActionState> {
  if (!areCommentsEnabled()) return { errorKey: "errors.closed" };
  let user;
  try {
    user = await requireUser();
  } catch {
    return { errorKey: "errors.signInRequired" };
  }
  const parsed = createSchema.safeParse({
    postId: formData.get("postId"),
    slug: formData.get("slug"),
    parentId: formData.get("parentId") || undefined,
    content: formData.get("content"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const raw = String(formData.get("content") ?? "").trim();
    if (issue?.path[0] === "content") {
      return { errorKey: raw.length === 0 ? "errors.empty" : "errors.tooLong" };
    }
    return { errorKey: "errors.invalidContent" };
  }
  if (!await allowCommentRequest(user.id)) return { errorKey: "errors.tooFast" };

  const { postId, slug, parentId, content } = parsed.data;
  const [post] = await db.select({ id: posts.id }).from(posts).where(and(
    eq(posts.id, postId),
    eq(posts.slug, slug),
    isNull(posts.deletedAt),
    or(eq(posts.status, "published"), and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql<Date>`now()`))),
  )).limit(1);
  if (!post) return { errorKey: "errors.postMissing" };

  const parent = parentId ? (await db.select({ postId: comments.postId, depth: comments.depth })
    .from(comments).where(and(eq(comments.id, parentId), eq(comments.status, "approved"), isNull(comments.deletedAt))).limit(1))[0] ?? null : null;
  if (parentId && !parent) return { errorKey: "errors.parentMissing" };
  let depth: number;
  try {
    depth = resolveCommentDepth(parent, postId);
  } catch (error) {
    return { errorKey: error instanceof Error && error.message.includes("MISMATCH") ? "errors.crossPost" : "errors.oneLevel" };
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
  if (!areCommentsEnabled()) return { errorKey: "errors.closed" };
  let user;
  try {
    user = await requireUser();
  } catch {
    return { errorKey: "errors.mustSignIn" };
  }
  const parsed = deleteSchema.safeParse({ commentId: formData.get("commentId"), slug: formData.get("slug") });
  if (!parsed.success) return { errorKey: "errors.invalidRequest" };
  const [existing] = await db.select({ id: comments.id, userId: comments.userId, deletedAt: comments.deletedAt })
    .from(comments).where(eq(comments.id, parsed.data.commentId)).limit(1);
  if (!existing) return { errorKey: "errors.notFound" };
  if (!canDeleteComment(user, existing.userId)) return { errorKey: "errors.noPermission" };
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
