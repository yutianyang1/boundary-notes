import en from "../messages/en.json";
import zh from "../messages/zh.json";
import type { Locale } from "./routing";

/**
 * 字典静态导入，查表同步返回。
 *
 * 刻意不用 `await import(...)`：cacheComponents 下任何 await 都会让组件被判为
 * 「未缓存数据访问」，而顶栏和页脚位于布局链上，外面包 Suspense 也救不回来
 * （"use cache" 也不行——模板字面量的动态 import 无法被静态分析，缓存不生效）。
 * 同步查表让整条链退回纯静态，顺带省掉一次异步往返。
 *
 * 两个 locale 的字典合计只有几 KB，全量打进产物没有负担。
 */
const dictionaries = { zh, en } as const;

export type Messages = typeof zh;

export function messagesFor(locale: Locale): Messages {
  return dictionaries[locale];
}
