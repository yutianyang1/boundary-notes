export const cacheTags = {
  posts: "posts",
  sitemap: "sitemap",
  feed: "feed",
  post: (slug: string) => `post:${slug}`,
  category: (slug: string) => `category:${slug}`,
  tag: (slug: string) => `tag:${slug}`,
  series: (slug: string) => `series:${slug}`,
  settings: "settings",
} as const;

export function postMutationTags(slug: string) {
  return [cacheTags.post(slug), cacheTags.posts, cacheTags.feed, cacheTags.sitemap] as const;
}
