import { defaultLocale, htmlLang, locales, type Locale } from "./routing";
import { localePath } from "./href";

/**
 * 构造 hreflang 备用链接。
 *
 * canonical 用当前语言自己的地址——两种语言是同一内容的不同呈现，
 * 各自可被独立收录，互相用 alternate 指认，而不是让英文版指向中文版。
 *
 * x-default 指向中文：不带前缀的那套地址是站点的规范入口，
 * 也是站外既有链接指向的地方。
 */
export function localeAlternates(path: string, locale: Locale) {
  const languages: Record<string, string> = {};
  for (const item of locales) {
    languages[htmlLang[item]] = localePath(path, item);
  }
  languages["x-default"] = localePath(path, defaultLocale);
  return { canonical: localePath(path, locale), languages };
}
