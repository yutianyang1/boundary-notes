import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { postReads } from "@/lib/db/schema";

/**
 * 阅读进度按账号存。匿名访客不产生记录,也看不到进度——
 * 服务端没有可靠的办法区分「这台设备背后是谁」,不区分就等于把
 * 别人的进度显示给你看,所以宁可对未登录的人整个功能不存在。
 */

/** 「这个用户读过这批文章里的哪几篇」。 */
export function buildReadPostsQuery(userId: string, postIds: string[]) {
  return db
    .select({ postId: postReads.postId })
    .from(postReads)
    .where(and(eq(postReads.userId, userId), inArray(postReads.postId, postIds)));
}

export function buildForgetPostsQuery(userId: string, postIds: string[]) {
  // 两个条件缺一不可:只按 postId 删会删掉所有人的记录。
  return db
    .delete(postReads)
    .where(and(eq(postReads.userId, userId), inArray(postReads.postId, postIds)));
}

export function buildMarkPostReadQuery(userId: string, postId: string) {
  // 重读不刷新 readAt:留首次读完的时间更有意义,也省掉一次写入。
  return db.insert(postReads).values({ userId, postId }).onConflictDoNothing();
}

/** postIds 为空时不下发查询:`in ()` 在 SQL 里是空集,白跑一趟。 */
export async function readPostsAmong(userId: string | null | undefined, postIds: string[]) {
  if (!userId || !postIds.length) return new Set<string>();
  const rows = await buildReadPostsQuery(userId, postIds);
  return new Set(rows.map((row) => row.postId));
}

export async function forgetPosts(userId: string, postIds: string[]) {
  if (!postIds.length) return;
  await buildForgetPostsQuery(userId, postIds);
}

export async function markPostRead(userId: string, postId: string) {
  await buildMarkPostReadQuery(userId, postId);
}
