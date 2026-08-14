import { connection } from "next/server";
import {
  getPublishedCategoryList,
  getPublishedSeriesList,
  getPublishedTagCloud,
  getSitemapPosts,
} from "@/lib/posts/queries";
import { urlsFor, type SitemapEntry } from "@/lib/sitemap/urls";

export async function GET() {
  await connection();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const [posts, tags, categories, series] = await Promise.all([
    getSitemapPosts(),
    getPublishedTagCloud(),
    getPublishedCategoryList(),
    getPublishedSeriesList(),
  ]);

  const entries: SitemapEntry[] = [
    ...["/", "/posts", "/tags", "/categories", "/series", "/about"].map((path) => ({ path })),
    ...posts.map((post) => ({
      path: `/posts/${encodeURIComponent(post.slug)}`,
      lastmod: post.updatedAt.toISOString(),
    })),
    ...tags.map((tag) => ({ path: `/tags/${encodeURIComponent(tag.slug)}` })),
    ...categories.map((category) => ({ path: `/categories/${encodeURIComponent(category.slug)}` })),
    ...series.map((item) => ({ path: `/series/${encodeURIComponent(item.slug)}` })),
  ];

  const body = entries.map((entry) => urlsFor(siteUrl, entry)).join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
