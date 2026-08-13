import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PopularPosts } from "@/components/article/popular-posts";
import { FeaturedPost } from "@/components/home/featured-post";
import { PostCard } from "@/components/home/post-card";
import { SubscriptionForm } from "@/components/subscribe/subscription-form";
import { isSubscriptionEnabled } from "@/lib/features";
import { getPopularPosts, getPublishedPosts } from "@/lib/posts/queries";

export default function HomePage() {
  return (
    <div className="shell">
      <section className="py-10 sm:py-14">
        <p className="eyebrow text-primary">软件 · 系统 · 长期主义</p>
        <h1 className="headline mt-6 text-[2.5rem] sm:text-6xl">
          在复杂系统中，
          <br />
          寻找清晰的边界。
        </h1>
        <p className="mt-6 max-w-[42em] text-lg leading-[1.8] text-muted-foreground sm:text-xl">
          记录软件架构、工程实践和那些值得反复推敲的设计决定。少一点捷径，多一点可以解释的取舍。
        </p>
      </section>

      <Suspense fallback={<HomeFeedSkeleton />}>
        <HomeFeed />
      </Suspense>
    </div>
  );
}

async function HomeFeed() {
  await connection();
  const [articles, popular] = await Promise.all([
    getPublishedPosts(5),
    getPopularPosts(5),
  ]);

  if (articles.length === 0) {
    return (
      <p className="rule-anchor mb-16 mt-8 pt-12 text-muted-foreground">
        第一篇文章正在路上。
      </p>
    );
  }

  const [featured, ...latest] = articles;
  return (
    <>
      <FeaturedPost post={featured} />

      <div className="grid gap-10 pb-16 pt-12 sm:pb-24 min-[1000px]:grid-cols-[minmax(0,1fr)_17rem] min-[1000px]:gap-14">
        <section>
          <div className="rule-anchor flex items-baseline justify-between pt-4">
            <h2 className="headline-sm text-xl">最新文章</h2>
            <Link
              href="/posts"
              className="group flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:gap-2.5 hover:text-primary"
            >
              查看全部
              <ArrowRight className="size-4" />
            </Link>
          </div>
          {latest.length ? (
            <div className="mt-6 grid gap-6 min-[560px]:grid-cols-2">
              {latest.map((article) => <PostCard key={article.id} post={article} coverAspect="aspect-[5/2]" />)}
            </div>
          ) : (
            <p className="mt-8 text-muted-foreground">更多文章正在路上。</p>
          )}
        </section>

        <aside className="rule-anchor pt-4">
          <PopularPosts posts={popular} headingLevel="h2" />
          {isSubscriptionEnabled() ? <div className="mt-8"><SubscriptionForm compact /></div> : null}
        </aside>
      </div>
    </>
  );
}

function HomeFeedSkeleton() {
  return (
    <div className="animate-pulse" aria-label="正在加载首页文章">
      <div className="mt-8 grid overflow-hidden rounded-[var(--radius-card)] border min-[820px]:grid-cols-2">
        <div className="min-h-60 bg-muted" />
        <div className="space-y-4 p-8">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-10 w-4/5 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-10 pb-16 pt-12 min-[1000px]:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          <div className="h-6 w-28 rounded bg-muted" />
          <div className="mt-6 grid gap-6 min-[560px]:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-[var(--radius-card)] border">
                <div className="aspect-[5/2] bg-muted" />
                <div className="space-y-3 p-4">
                  <div className="h-5 w-4/5 rounded bg-muted" />
                  <div className="h-4 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="h-64 rounded bg-muted" />
      </div>
    </div>
  );
}
