import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { posts, postViewCounts, postViewDaily } from "@/lib/db/schema";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { shanghaiDayKey } from "@/lib/posts/view-analytics";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "请求来源不合法。" }, { status: 403 });
  }

  const { slug } = await params;
  if (!slug || slug.length > 240) {
    return NextResponse.json({ error: "文章不存在。" }, { status: 404 });
  }

  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(
      eq(posts.slug, slug),
      isNull(posts.deletedAt),
      or(
        eq(posts.status, "published"),
        and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql<Date>`now()`)),
      ),
    ))
    .limit(1);
  if (!post) return NextResponse.json({ error: "文章不存在。" }, { status: 404 });

  const now = new Date();
  const counter = await db.transaction(async (tx) => {
    const [total] = await tx
      .insert(postViewCounts)
      .values({ postId: post.id, viewCount: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: postViewCounts.postId,
        set: {
          viewCount: sql`${postViewCounts.viewCount} + 1`,
          updatedAt: now,
        },
      })
      .returning({ viewCount: postViewCounts.viewCount });

    await tx
      .insert(postViewDaily)
      .values({ postId: post.id, day: shanghaiDayKey(now), viewCount: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [postViewDaily.postId, postViewDaily.day],
        set: {
          viewCount: sql`${postViewDaily.viewCount} + 1`,
          updatedAt: now,
        },
      });

    return total;
  });

  return NextResponse.json(counter, {
    headers: { "Cache-Control": "no-store" },
  });
}
