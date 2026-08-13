export function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /internal/\nSitemap: ${siteUrl}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
