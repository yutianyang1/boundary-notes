/**
 * 卡片上的短日期：中文「8月27日」，英文「Aug 27」。
 *
 * 原来两种语言都用 en-CA 的「08-27」。数字补零加连字符读起来像数据库字段，
 * 在 Inter 的等宽数字下连字符两侧还显得空，放在卡片底部很生硬。
 *
 * 统一按上海时区格式化：文章发布时间以作者所在时区为准，不随读者所在地变。
 */

type Locale = "zh" | "en";

const formatters: Record<Locale, Intl.DateTimeFormat> = {
  // zh-CN 用 month: "numeric" 会得到「8/27」，要 "short" 才是「8月27日」。
  zh: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "short", day: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", month: "short", day: "numeric" }),
};

export function shortDate(date: Date, locale: Locale) {
  return formatters[locale].format(date);
}
