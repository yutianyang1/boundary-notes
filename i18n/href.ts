import { defaultLocale, locales, type Locale } from "./routing";

/**
 * 将表单或查询参数里的不可信 locale 收敛为站点支持的语言。
 * Server Action 不能直接继承页面 params，因此由表单显式携带并在这里校验。
 */
export function normalizeLocale(value: unknown): Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value)
    ? value as Locale
    : defaultLocale;
}

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
  // 后台是独立的非 i18n 根路由；给它补 /en 会落入公开站点的 404 兜底。
  if (href === "/admin" || href.startsWith("/admin/") || href.startsWith("/admin?") || href.startsWith("/admin#")) {
    return href;
  }
  // callbackUrl 可能已经带有 locale，认证跳转再次处理时不能重复加前缀。
  if (href === `/${locale}` || href.startsWith(`/${locale}/`) || href.startsWith(`/${locale}?`) || href.startsWith(`/${locale}#`)) {
    return href;
  }
  // 首页要得到 /en 而不是 /en/：后者和实际路由不一致，
  // 出现在 sitemap 与 canonical 里会被当成另一个地址。
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}
