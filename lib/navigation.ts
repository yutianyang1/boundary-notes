/**
 * 主导航。label 走 nav 命名空间的字典 key，不要在这里写死文案。
 */
export const navigation = [
  { href: "/posts", key: "posts" },
  { href: "/categories", key: "categories" },
  { href: "/tags", key: "tags" },
  { href: "/series", key: "series" },
  { href: "/about", key: "about" },
] as const;

export type NavKey = (typeof navigation)[number]["key"];
