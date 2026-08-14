import { defaultLocale, type Locale } from "./routing";

/**
 * 给站内路径补上 locale 前缀。默认语言不带前缀（localePrefix: "as-needed"）。
 *
 * 服务端组件里用它配合原生 next/link，而不是 next-intl 的 <Link>：
 * 后者在服务端要从请求上下文取当前 locale，在 cacheComponents 下会被判为
 * 未缓存数据，让顶栏和页脚阻塞整个页面的静态外壳。
 * 客户端组件不受影响，locale 由 NextIntlClientProvider 提供，照常用 next-intl 的 <Link>。
 */
export function localePath(href: string, locale: Locale) {
  if (locale === defaultLocale) return href;
  // 首页要得到 /en 而不是 /en/：后者和实际路由不一致，
  // 出现在 sitemap 与 canonical 里会被当成另一个地址。
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}
