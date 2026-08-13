import { getPublishedCategoryList, getPublishedSeriesList, getPublishedTagCloud, getSitemapPosts } from "@/lib/posts/queries";
import { connection } from "next/server";

export async function GET() {
  await connection();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const [posts, tags, categories, series] = await Promise.all([getSitemapPosts(), getPublishedTagCloud(), getPublishedCategoryList(), getPublishedSeriesList()]);
  const staticUrls = ["", "/posts", "/tags", "/categories", "/series", "/about"].map((path) => `<url><loc>${siteUrl}${path}</loc></url>`).join("");
  const postUrls = posts.map((post) => `<url><loc>${siteUrl}/posts/${encodeURIComponent(post.slug)}</loc><lastmod>${post.updatedAt.toISOString()}</lastmod></url>`).join("");
  const tagUrls = tags.map((tag) => `<url><loc>${siteUrl}/tags/${encodeURIComponent(tag.slug)}</loc></url>`).join("");
  const categoryUrls = categories.map((category) => `<url><loc>${siteUrl}/categories/${encodeURIComponent(category.slug)}</loc></url>`).join("");
  const seriesUrls = series.map((item) => `<url><loc>${siteUrl}/series/${encodeURIComponent(item.slug)}</loc></url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${postUrls}${tagUrls}${categoryUrls}${seriesUrls}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
