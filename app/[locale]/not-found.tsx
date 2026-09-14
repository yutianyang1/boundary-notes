import { NotFoundContent } from "@/components/not-found-content";

/**
 * locale 段的 404 兜底。
 *
 * 只在站点外壳还没确定时才会走到这里，实际上就是 layout 的 hasLocale 校验把
 * 非法 locale 打成 notFound 的那一下——此时连该用哪套顶栏都还不知道，所以这一
 * 版不带站点导航。正常的「页面不存在」走 `(site)/not-found.tsx`，那个带顶栏
 * 和页脚。
 */
export default function NotFound() {
  return <NotFoundContent />;
}
