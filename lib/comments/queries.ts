import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, users } from "@/lib/db/schema";

export const COMMENTS_PAGE_SIZE = 20;

const selection = {
  id: comments.id,
  parentId: comments.parentId,
  userId: comments.userId,
  content: comments.content,
  createdAt: comments.createdAt,
  deletedAt: comments.deletedAt,
  authorName: users.name,
  authorImage: users.image,
  authorDeletedAt: users.deletedAt,
};

export async function getApprovedComments(postId: string, page: number) {
  const offset = (page - 1) * COMMENTS_PAGE_SIZE;
  const [topLevel, [{ count }]] = await Promise.all([
    db.select(selection).from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.postId, postId), eq(comments.status, "approved"), eq(comments.depth, 0)))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(COMMENTS_PAGE_SIZE)
      .offset(offset),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(comments)
      .where(and(eq(comments.postId, postId), eq(comments.status, "approved"), eq(comments.depth, 0))),
  ]);
  const parentIds = topLevel.map((item) => item.id);
  const replies = parentIds.length ? await db.select(selection).from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.postId, postId), eq(comments.status, "approved"), inArray(comments.parentId, parentIds)))
    .orderBy(asc(comments.createdAt), asc(comments.id)) : [];
  const repliesByParent = new Map<string, typeof replies>();
  for (const reply of replies) {
    if (!reply.parentId) continue;
    const group = repliesByParent.get(reply.parentId) ?? [];
    group.push(reply);
    repliesByParent.set(reply.parentId, group);
  }
  return {
    comments: topLevel.map((item) => ({ ...item, replies: repliesByParent.get(item.id) ?? [] })),
    count,
    page,
    pages: Math.max(1, Math.ceil(count / COMMENTS_PAGE_SIZE)),
  };
}
