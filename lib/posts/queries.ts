import { and, asc, desc, eq, ilike, isNull, lte, ne, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cacheTags } from "@/lib/cache/tags";
import { db } from "@/lib/db";
import { categories, posts, postTags, postViewCounts, series, tags, users } from "@/lib/db/schema";

const publiclyVisible = and(
  isNull(posts.deletedAt),
  or(
    eq(posts.status, "published"),
    and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql<Date>`now()`)),
  ),
);

/** 正文字符数。中文按字符计，用于估算阅读时长。 */
const charCount = sql<number>`length(${posts.contentMd})`.mapWith(Number);
const viewCount = sql<number>`coalesce(${postViewCounts.viewCount}, 0)`.mapWith(Number);

export async function getPublishedPost(slug: string) {
  "use cache";
  cacheTag(cacheTags.posts, cacheTags.post(slug));

  const [post] = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      contentHtml: posts.contentHtml,
      cover: posts.cover,
      revision: posts.revision,
      seoTitle: posts.seoTitle,
      seoDescription: posts.seoDescription,
      canonicalUrl: posts.canonicalUrl,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      categoryName: categories.name,
      categorySlug: categories.slug,
      authorName: users.name,
      authorImage: users.image,
      charCount,
    })
    .from(posts)
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.slug, slug), publiclyVisible))
    .limit(1);

  if (post) {
    const tagRows = await db
      .select({ name: tags.name, slug: tags.slug })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(and(eq(postTags.postId, post.id), isNull(tags.deletedAt)))
      .orderBy(tags.name);
    for (const tag of tagRows) cacheTag(cacheTags.tag(tag.slug));
    cacheLife("published-content");
    return { ...post, tags: tagRows };
  } else {
    cacheLife("negative");
  }
  return null;
}

export async function getRelatedPosts(postId: string, categorySlug: string | null, limit = 3) {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");
  if (!categorySlug) return [];
  cacheTag(cacheTags.category(categorySlug));

  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      cover: posts.cover,
      publishedAt: posts.publishedAt,
      categoryName: categories.name,
      categorySlug: categories.slug,
      charCount,
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(
      publiclyVisible,
      ne(posts.id, postId),
      eq(categories.slug, categorySlug),
      isNull(categories.deletedAt),
    ))
    .orderBy(desc(posts.pinned), desc(posts.publishedAt))
    .limit(limit);
}

export async function getPopularPosts(limit = 5, excludePostId?: string) {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");

  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      categoryName: categories.name,
      publishedAt: posts.publishedAt,
      viewCount,
    })
    .from(posts)
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .leftJoin(postViewCounts, eq(posts.id, postViewCounts.postId))
    .where(and(
      publiclyVisible,
      excludePostId ? ne(posts.id, excludePostId) : undefined,
    ))
    .orderBy(desc(viewCount), desc(posts.publishedAt))
    .limit(limit);
}

export async function getPublishedPosts(limit = 20) {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");

  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      cover: posts.cover,
      publishedAt: posts.publishedAt,
      pinned: posts.pinned,
      categoryName: categories.name,
      categorySlug: categories.slug,
      charCount,
    })
    .from(posts)
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .where(publiclyVisible)
    .orderBy(desc(posts.pinned), desc(posts.publishedAt))
    .limit(limit);
}

export async function getPrimaryPublishedAuthor() {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");

  const [profile] = await db
    .select({
      image: users.image,
      postCount: sql<number>`count(${posts.id})`.mapWith(Number),
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(publiclyVisible)
    .groupBy(users.id, users.image)
    .orderBy(desc(sql`count(${posts.id})`))
    .limit(1);

  return profile ?? null;
}

export async function getPublishedPostsByTag(tagSlug: string, limit = 100) {
  "use cache";
  cacheTag(cacheTags.posts, cacheTags.tag(tagSlug));
  cacheLife("feed-index");

  const [tag] = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(and(eq(tags.slug, tagSlug), isNull(tags.deletedAt)))
    .limit(1);
  if (!tag) return null;

  const taggedPosts = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      cover: posts.cover,
      publishedAt: posts.publishedAt,
      pinned: posts.pinned,
      categoryName: categories.name,
      categorySlug: categories.slug,
      charCount,
    })
    .from(postTags)
    .innerJoin(posts, eq(postTags.postId, posts.id))
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .where(and(eq(tags.slug, tagSlug), isNull(tags.deletedAt), publiclyVisible))
    .orderBy(desc(posts.pinned), desc(posts.publishedAt))
    .limit(limit);

  return { tag, posts: taggedPosts };
}

export async function getPublishedTagCloud() {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");

  return db
    .select({
      name: tags.name,
      slug: tags.slug,
      count: sql<number>`count(${posts.id})`.mapWith(Number),
    })
    .from(tags)
    .innerJoin(postTags, eq(tags.id, postTags.tagId))
    .innerJoin(posts, eq(postTags.postId, posts.id))
    .where(and(isNull(tags.deletedAt), publiclyVisible))
    .groupBy(tags.id, tags.name, tags.slug)
    .orderBy(desc(sql`count(${posts.id})`), tags.name);
}

export async function getPublishedCategoryList() {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");

  return buildPublishedCategoryListQuery();
}

export function buildPublishedCategoryListQuery() {
  return db
    .select({
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      count: sql<number>`count(${posts.id})`.mapWith(Number),
    })
    .from(categories)
    .innerJoin(posts, eq(categories.id, posts.categoryId))
    .where(and(isNull(categories.deletedAt), publiclyVisible))
    .groupBy(categories.id, categories.name, categories.slug, categories.description)
    .orderBy(desc(sql`count(${posts.id})`), categories.name);
}

export async function getPublishedPostsByCategory(categorySlug: string, limit = 100) {
  "use cache";
  cacheTag(cacheTags.posts, cacheTags.category(categorySlug));
  cacheLife("feed-index");

  const [category] = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
    })
    .from(categories)
    .where(and(eq(categories.slug, categorySlug), isNull(categories.deletedAt)))
    .limit(1);
  if (!category) return null;

  const categoryPosts = await buildPublishedPostsForCategoryQuery(category.id, limit);

  return { category, posts: categoryPosts };
}

export function buildPublishedPostsForCategoryQuery(categoryId: string, limit = 100) {
  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      cover: posts.cover,
      publishedAt: posts.publishedAt,
      pinned: posts.pinned,
      categoryName: categories.name,
      categorySlug: categories.slug,
      charCount,
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt), publiclyVisible))
    .orderBy(desc(posts.pinned), desc(posts.publishedAt))
    .limit(limit);
}

export async function getPublishedSeriesList() {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");

  return buildPublishedSeriesListQuery();
}

export function buildPublishedSeriesListQuery() {
  return db
    .select({
      name: series.name,
      slug: series.slug,
      description: series.description,
      cover: series.cover,
      count: sql<number>`count(${posts.id})`.mapWith(Number),
    })
    .from(series)
    .innerJoin(posts, eq(series.id, posts.seriesId))
    .where(and(isNull(series.deletedAt), publiclyVisible))
    .groupBy(series.id, series.name, series.slug, series.description, series.cover)
    .orderBy(desc(sql`count(${posts.id})`), series.name);
}

export async function getPublishedSeries(seriesSlug: string, limit = 100) {
  "use cache";
  cacheTag(cacheTags.posts, cacheTags.series(seriesSlug));
  cacheLife("feed-index");

  const [seriesRow] = await db
    .select({
      id: series.id,
      name: series.name,
      slug: series.slug,
      description: series.description,
      cover: series.cover,
    })
    .from(series)
    .where(and(eq(series.slug, seriesSlug), isNull(series.deletedAt)))
    .limit(1);
  if (!seriesRow) return null;

  const seriesPosts = await buildPublishedSeriesPostsQuery(seriesRow.id, limit);

  return { series: seriesRow, posts: seriesPosts };
}

export function buildPublishedSeriesPostsQuery(seriesId: string, limit = 100) {
  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      cover: posts.cover,
      publishedAt: posts.publishedAt,
      pinned: posts.pinned,
      categoryName: categories.name,
      categorySlug: categories.slug,
      charCount,
      seriesOrder: posts.seriesOrder,
    })
    .from(posts)
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .where(and(eq(posts.seriesId, seriesId), publiclyVisible))
    .orderBy(asc(posts.seriesOrder), asc(posts.publishedAt), asc(posts.id))
    .limit(limit);
}

type SeriesNavigationRow = {
  id: string;
  slug: string;
  title: string;
};

export function selectSeriesNavigation(rows: SeriesNavigationRow[], currentPostId: string) {
  const index = rows.findIndex((row) => row.id === currentPostId);
  if (index < 0) return null;
  const adjacent = (row: SeriesNavigationRow | undefined) => row
    ? { slug: row.slug, title: row.title }
    : null;
  return {
    total: rows.length,
    position: index + 1,
    prev: adjacent(rows[index - 1]),
    next: adjacent(rows[index + 1]),
  };
}

export async function getSeriesNavForPost(postId: string) {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("published-content");

  const [membership] = await db
    .select({
      seriesId: series.id,
      name: series.name,
      slug: series.slug,
    })
    .from(posts)
    .innerJoin(series, eq(posts.seriesId, series.id))
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt), isNull(series.deletedAt)))
    .limit(1);
  if (!membership) return null;

  cacheTag(cacheTags.series(membership.slug));
  const visibleMembers = await buildVisibleSeriesMembersQuery(membership.seriesId);
  const navigation = selectSeriesNavigation(visibleMembers, postId);
  if (!navigation) return null;

  return {
    series: { name: membership.name, slug: membership.slug },
    ...navigation,
  };
}

export function buildVisibleSeriesMembersQuery(seriesId: string) {
  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
    })
    .from(posts)
    .where(and(eq(posts.seriesId, seriesId), publiclyVisible))
    .orderBy(asc(posts.seriesOrder), asc(posts.publishedAt), asc(posts.id));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function searchPublishedPosts(query: string, limit = 50) {
  const normalized = query.normalize("NFKC").trim().slice(0, 100);
  if (!normalized) return [];
  const pattern = `%${escapeLike(normalized)}%`;
  const matches = or(
    ilike(posts.title, pattern),
    ilike(posts.summary, pattern),
    ilike(posts.contentMd, pattern),
  );

  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      cover: posts.cover,
      publishedAt: posts.publishedAt,
      pinned: posts.pinned,
      categoryName: categories.name,
      categorySlug: categories.slug,
      charCount,
    })
    .from(posts)
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .where(and(publiclyVisible, matches))
    .orderBy(
      sql`case when ${ilike(posts.title, pattern)} then 0 when ${ilike(posts.summary, pattern)} then 1 else 2 end`,
      desc(posts.publishedAt),
    )
    .limit(limit);
}

export async function getFeedPosts(limit = 50) {
  "use cache";
  cacheTag(cacheTags.posts, cacheTags.feed);
  cacheLife("feed-index");

  return db.select({
    slug: posts.slug,
    title: posts.title,
    summary: posts.summary,
    contentHtml: posts.contentHtml,
    publishedAt: posts.publishedAt,
    updatedAt: posts.updatedAt,
  }).from(posts).where(publiclyVisible).orderBy(desc(posts.publishedAt)).limit(limit);
}

export async function getSitemapPosts() {
  "use cache";
  cacheTag(cacheTags.posts, cacheTags.sitemap);
  cacheLife("feed-index");

  return db.select({ slug: posts.slug, updatedAt: posts.updatedAt }).from(posts).where(publiclyVisible).orderBy(desc(posts.updatedAt));
}
