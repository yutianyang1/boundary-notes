import Link from "next/link";
import type { getPopularPosts } from "@/lib/posts/queries";

type PopularPost = Awaited<ReturnType<typeof getPopularPosts>>[number];

const numberFormatter = new Intl.NumberFormat("zh-CN");

export function PopularPosts({
  posts,
  headingLevel = "h3",
}: {
  posts: PopularPost[];
  headingLevel?: "h2" | "h3";
}) {
  if (!posts.length) return null;
  const Heading = headingLevel;

  return (
    <div>
      <Heading className="eyebrow text-foreground/70">热门文章</Heading>
      <ol className="mt-4 divide-y divide-hairline border-b border-hairline">
        {posts.map((post, index) => (
          <li key={post.id} className="py-4 first:pt-0">
            <Link href={`/posts/${post.slug}`} className="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
              <span className={`pt-0.5 text-base font-extrabold tabular-nums ${index === 0 ? "text-warm" : "text-primary"}`}>
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-6 group-hover:text-primary">
                  {post.title}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {post.categoryName ? <span>{post.categoryName}</span> : null}
                  <span>{numberFormatter.format(post.viewCount)} 次阅读</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
