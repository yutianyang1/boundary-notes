import { NotFoundContent } from "@/components/not-found-content";

/**
 * 站点内的 404。
 *
 * 放在 `(site)` 里，才会套上这一组的布局，也就是带着顶栏和页脚渲染——之前
 * 只有根部那一个 not-found，页面是光秃秃一屏，走到死胡同的人反而没有任何导航。
 * 绝大多数 404 都落在这里：文章 slug 不存在、标签不存在，以及同组下的
 * `[...rest]` 捕获的一切未匹配路径。
 */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
