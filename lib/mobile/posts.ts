import { and, desc, eq, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, posts, users } from "@/lib/db/schema";

const visible = and(isNull(posts.deletedAt), or(eq(posts.status, "published"), and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql`now()`))));
export async function mobilePosts(query: string, page: number) {
  return db.select({ id: posts.id, slug: posts.slug, title: posts.title, summary: posts.summary, cover: posts.cover, publishedAt: posts.publishedAt, authorName: users.name, authorImage: users.image, categoryName: categories.name, categorySlug: categories.slug, charCount: sql<number>`length(${posts.contentMd})`.mapWith(Number) })
    .from(posts).innerJoin(users, eq(posts.authorId, users.id)).leftJoin(categories, eq(posts.categoryId,categories.id))
    .where(and(visible, query ? or(ilike(posts.title, `%${query}%`), ilike(posts.summary, `%${query}%`)) : undefined))
    .orderBy(desc(posts.publishedAt), desc(posts.id)).limit(21).offset((page - 1) * 20);
}
export async function mobilePost(slug: string) {
  const [post] = await db.select({ id: posts.id, slug: posts.slug, title: posts.title, summary: posts.summary, contentMd: posts.contentMd, cover:posts.cover, publishedAt: posts.publishedAt, authorName: users.name, authorImage: users.image, categoryName:categories.name, categorySlug:categories.slug, charCount:sql<number>`length(${posts.contentMd})`.mapWith(Number) })
    .from(posts).innerJoin(users, eq(posts.authorId, users.id)).leftJoin(categories,eq(posts.categoryId,categories.id)).where(and(visible, eq(posts.slug, slug))).limit(1);
  return post ?? null;
}
