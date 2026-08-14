import { localePath } from "@/i18n/href";
import { defaultLocale, htmlLang, locales } from "@/i18n/routing";

export type SitemapEntry = { path: string; lastmod?: string };

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 每个路径输出两条 <url>（每个 locale 一条），每条内部再用 xhtml:link
 * 列出全部语言版本加 x-default。
 *
 * 这是 Google 要求的对称写法：一个 URL 声明的备用集合里必须包含它自己，
 * 否则整组 hreflang 会被忽略。
 *
 * 放在 lib 而不是路由文件里：route handler 只允许导出 HTTP 方法和几个
 * 约定字段，导出别的东西会让类型检查失败。
 */
export function urlsFor(siteUrl: string, entry: SitemapEntry) {
  const alternates = [
    ...locales.map((locale) => ({
      hreflang: htmlLang[locale],
      href: `${siteUrl}${escapeXml(localePath(entry.path, locale))}`,
    })),
    { hreflang: "x-default", href: `${siteUrl}${escapeXml(localePath(entry.path, defaultLocale))}` },
  ]
    .map((item) => `<xhtml:link rel="alternate" hreflang="${item.hreflang}" href="${item.href}"/>`)
    .join("");

  return locales
    .map((locale) => {
      const loc = `${siteUrl}${escapeXml(localePath(entry.path, locale))}`;
      const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
      return `<url><loc>${loc}</loc>${lastmod}${alternates}</url>`;
    })
    .join("");
}
