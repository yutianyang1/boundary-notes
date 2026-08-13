import { getFeedPosts } from "@/lib/posts/queries";
import { connection } from "next/server";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character);
}

export async function GET() {
  await connection();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "边界笔记";
  const posts = await getFeedPosts();
  const items = posts.map((post) => `<item><title>${escapeXml(post.title)}</title><link>${siteUrl}/posts/${encodeURIComponent(post.slug)}</link><guid isPermaLink="true">${siteUrl}/posts/${encodeURIComponent(post.slug)}</guid><description>${escapeXml(post.summary)}</description>${post.publishedAt ? `<pubDate>${post.publishedAt.toUTCString()}</pubDate>` : ""}</item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(siteName)}</title><link>${siteUrl}</link><description>软件架构、工程实践与长期主义</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
