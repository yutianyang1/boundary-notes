import { defineRouting } from "next-intl/routing";

export const locales = ["zh", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh";

/** <html lang> 用的 BCP 47 标签，与内部 locale 代码区分开。 */
export const htmlLang: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  // 默认语言不带前缀：/posts/x 保持中文原地址不变，/en/posts/x 才是英文。
  // 站点已上线且 sitemap 已提交，现有中文 URL 不允许位移。
  localePrefix: "as-needed",
  // 语言只由 URL 前缀和显式切换决定，不做 Accept-Language 自动跳转：
  // 自动跳转会让爬虫拿到非预期语言，也会让同一条分享链接在不同人那里显示不同语言。
  localeDetection: false,
});
