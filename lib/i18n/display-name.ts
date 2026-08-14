import type { Locale } from "@/i18n/routing";

type Localizable = { name: string; nameEn?: string | null };
type LocalizableDescription = { description?: string | null; descriptionEn?: string | null };

/**
 * 分类、标签、系列的展示名。
 *
 * 英文名留空时回退到中文——多数分类不会被翻译，回退保证英文站不出现空标签。
 *
 * 刻意不在 SQL 里按 locale 取值：查询结果因此与语言无关，
 * cacheComponents 下两种语言共用同一份缓存，而不是各缓存一份。
 */
export function displayName(row: Localizable, locale: Locale) {
  if (locale === "en") return row.nameEn?.trim() || row.name;
  return row.name;
}

export function displayDescription(row: LocalizableDescription, locale: Locale) {
  if (locale === "en") return row.descriptionEn?.trim() || row.description || null;
  return row.description ?? null;
}

/**
 * 展示名对应的语言标签，供 `lang` 属性使用。
 * 回退到中文名时要如实标注，浏览器才会对它提示翻译。
 */
export function displayNameLang(row: Localizable, locale: Locale) {
  if (locale === "en" && row.nameEn?.trim()) return "en";
  return "zh-CN";
}
