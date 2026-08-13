import { notFound } from "next/navigation";

/**
 * 未匹配路径的兜底。proxy 会把它们改写到 locale 段下，
 * 这里立即 notFound()，好让 app/[locale]/not-found.tsx 在
 * 完整的根布局里渲染——否则会落到 Next 内置的 _not-found，
 * 那个既没有 <html lang>，也用不上站点自己的 404 设计。
 */
export default function CatchAllNotFound(): never {
  notFound();
}
