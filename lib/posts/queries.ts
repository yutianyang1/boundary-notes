import { and, asc, desc, eq, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cacheTags } from "@/lib/cache/tags";
import { db } from "@/lib/db";
import { categories, postRedirects, posts, postTags, postViewCounts, series, tags, users } from "@/lib/db/schema";

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

function decodeRouteSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export async function getPublishedPost(slug: string) {
  "use cache";
  const decodedSlug = decodeRouteSlug(slug);
  cacheTag(cacheTags.posts, cacheTags.post(decodedSlug));

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
      // 相关文章要按它排掉同系列的成员，得在正文这趟查询里一起带出来。
      seriesId: posts.seriesId,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      categoryName: categories.name,
      categoryNameEn: categories.nameEn,
      categorySlug: categories.slug,
      authorName: users.name,
      authorImage: users.image,
      charCount,
    })
    .from(posts)
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.slug, decodedSlug), publiclyVisible))
    .limit(1);

  if (post) {
    const tagRows = await db
      .select({ name: tags.name, nameEn: tags.nameEn, slug: tags.slug })
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

export function buildPublishedPostRedirectQuery(oldSlug: string) {
  const decodedSlug = decodeRouteSlug(oldSlug);
  return db
    .select({ slug: posts.slug })
    .from(postRedirects)
    .innerJoin(posts, eq(postRedirects.postId, posts.id))
    .where(and(eq(postRedirects.oldSlug, decodedSlug), publiclyVisible))
    .limit(1);
}

/** Resolve a historical article slug only when its current post is public. */
export async function getPublishedPostRedirect(oldSlug: string) {
  "use cache";
  const decodedSlug = decodeRouteSlug(oldSlug);
  cacheTag(cacheTags.posts, cacheTags.post(decodedSlug));

  const [target] = await buildPublishedPostRedirectQuery(decodedSlug);
  if (target) {
    cacheTag(cacheTags.post(target.slug));
    cacheLife("published-content");
    return target.slug;
  }

  cacheLife("negative");
  return null;
}

type RelatedPostsInput = {
  postId: string;
  categorySlug: string | null;
  seriesId: string | null;
  tagSlugs: string[];
};

/**
 * 相关文章。先按共同标签数排，标签一样多再看是否同分类，最后才按时间。
 *
 * 只按分类取最新几篇的话，同一分类下每篇文章底部推的都是同样那几篇，
 * 读者翻两篇就会发现推荐栏从没变过；标签重合才是「这两篇在讲同一件事」的信号。
 */
export function buildRelatedPostsQuery(
  { postId, categorySlug, seriesId, tagSlugs }: RelatedPostsInput,
  limit: number,
) {
  const currentTagIds = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(inArray(tags.slug, tagSlugs), isNull(tags.deletedAt)));

  // 只 join 当前文章也带着的那些标签，count 出来正好是重合数。
  // 没有标签时 join 恒不成立，重合数一律为 0，排序自然退回按分类。
  const sharedTags = tagSlugs.length
    ? and(eq(postTags.postId, posts.id), inArray(postTags.tagId, currentTagIds))
    : sql`false`;
  const overlap = sql`count(${postTags.tagId})`;
  // coalesce 不能省：候选文章没有分类时比较结果是 null，而 Postgres 的
  // desc 默认把 null 排在最前，不兜底的话无分类的文章会插到最上面。
  const sameCategory = categorySlug
    ? sql`coalesce(${categories.slug} = ${categorySlug}, false)`
    : null;
  const ranking = sameCategory ? [desc(overlap), desc(sameCategory)] : [desc(overlap)];

  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      categoryName: categories.name,
      categoryNameEn: categories.nameEn,
      charCount,
    })
    .from(posts)
    .leftJoin(categories, and(eq(posts.categoryId, categories.id), isNull(categories.deletedAt)))
    .leftJoin(postTags, sharedTags)
    .where(and(
      publiclyVisible,
      ne(posts.id, postId),
      // 同系列的不推：正文下方的系列导航已经把上下篇列出来了，
      // 而同系列的文章标签分类几乎必然重合，不排掉会把推荐位全占满。
      seriesId ? or(isNull(posts.seriesId), ne(posts.seriesId, seriesId)) : undefined,
    ))
    .groupBy(posts.id, categories.id)
    // 一篇都不沾边的文章宁可不推：底部空着也好过挂三篇没关系的。
    .having(sameCategory ? sql`${overlap} > 0 or ${sameCategory}` : sql`${overlap} > 0`)
    .orderBy(...ranking, desc(posts.pinned), desc(posts.publishedAt))
    .limit(limit);
}

export async function getRelatedPosts(input: RelatedPostsInput, limit = 3) {
  "use cache";
  cacheTag(cacheTags.posts);
  cacheLife("feed-index");
  // 既没分类也没标签，就没有「相关」可言，不必往数据库跑一趟。
  if (!input.categorySlug && !input.tagSlugs.length) return [];
  if (input.categorySlug) cacheTag(cacheTags.category(input.categorySlug));
  for (const slug of input.tagSlugs) cacheTag(cacheTags.tag(slug));

  return buildRelatedPostsQuery(input, limit);
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
      categoryNameEn: categories.nameEn,
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
      categoryNameEn: categories.nameEn,
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
    .select({ id: tags.id, name: tags.name, nameEn: tags.nameEn, slug: tags.slug })
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
      categoryNameEn: categories.nameEn,
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
      nameEn: tags.nameEn,
      slug: tags.slug,
      count: sql<number>`count(${posts.id})`.mapWith(Number),
    })
    .from(tags)
    .innerJoin(postTags, eq(tags.id, postTags.tagId))
    .innerJoin(posts, eq(postTags.postId, posts.id))
    .where(and(isNull(tags.deletedAt), publiclyVisible))
    .groupBy(tags.id, tags.name, tags.nameEn, tags.slug)
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
      nameEn: categories.nameEn,
      slug: categories.slug,
      description: categories.description,
      descriptionEn: categories.descriptionEn,
      count: sql<number>`count(${posts.id})`.mapWith(Number),
    })
    .from(categories)
    .innerJoin(posts, eq(categories.id, posts.categoryId))
    .where(and(isNull(categories.deletedAt), publiclyVisible))
    .groupBy(categories.id, categories.name, categories.nameEn, categories.slug, categories.description, categories.descriptionEn)
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
      nameEn: categories.nameEn,
      slug: categories.slug,
      description: categories.description,
      descriptionEn: categories.descriptionEn,
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
      categoryNameEn: categories.nameEn,
      categorySlug: categories.slug,
      charCount,
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt), publiclyVisible))
    .orderBy(desc(posts.pinned), desc(posts.publishedAt))
    .limit(limit);
}

/** slug → 当前公开文章的 id。标记已读用,不走缓存。 */
export function buildPublicPostIdQuery(slug: string) {
  return db.select({ id: posts.id }).from(posts)
    .where(and(eq(posts.slug, decodeURIComponent(slug)), publiclyVisible)).limit(1);
}

/** 一个系列下所有公开文章的 id。重置该系列进度时用。 */
export function buildSeriesPostIdsQuery(seriesSlug: string) {
  return db.select({ id: posts.id }).from(posts)
    .innerJoin(series, eq(posts.seriesId, series.id))
    .where(and(eq(series.slug, decodeURIComponent(seriesSlug)), isNull(series.deletedAt), publiclyVisible));
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
      nameEn: series.nameEn,
      slug: series.slug,
      description: series.description,
      descriptionEn: series.descriptionEn,
      cover: series.cover,
      count: sql<number>`count(${posts.id})`.mapWith(Number),
    })
    .from(series)
    .innerJoin(posts, eq(series.id, posts.seriesId))
    .where(and(isNull(series.deletedAt), publiclyVisible))
    .groupBy(series.id, series.name, series.nameEn, series.slug, series.description, series.descriptionEn, series.cover)
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
      nameEn: series.nameEn,
      slug: series.slug,
      description: series.description,
      descriptionEn: series.descriptionEn,
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
      categoryNameEn: categories.nameEn,
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
    // 全系列的 post id 一起带出来:导航卡上的阅读进度要按这批 id
    // 去查当前用户读过几篇,只有上下篇是不够的。
    postIds: rows.map((row) => row.id),
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
      nameEn: series.nameEn,
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
    // nameEn 要一路带到渲染处:只回传 name 的话,英文站的系列导航
    // 会显示中文系列名,而这个名字是有英文版的。
    series: { name: membership.name, nameEn: membership.nameEn, slug: membership.slug },
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
      categoryNameEn: categories.nameEn,
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
