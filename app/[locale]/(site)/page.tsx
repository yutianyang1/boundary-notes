import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PopularPosts } from "@/components/article/popular-posts";
import { FeaturedPost } from "@/components/home/featured-post";
import { PostCard } from "@/components/home/post-card";
import { SubscriptionForm } from "@/components/subscribe/subscription-form";
import { isSubscriptionEnabled } from "@/lib/features";
import { getPopularPosts, getPublishedPosts } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "home" });

  return (
    <div className="shell">
      <section className="py-10 sm:py-14">
        <p className="eyebrow text-primary">{t("eyebrow")}</p>
        <h1 className="headline mt-6 text-[2.5rem] sm:text-6xl">
          {/* 换行位置随语言而定，所以由字典里的 <br> 标签决定。 */}
          {t.rich("headline", { br: () => <br /> })}
        </h1>
        <p className="mt-6 max-w-[42em] text-lg leading-[1.8] text-muted-foreground sm:text-xl">
          {t("lead")}
        </p>
      </section>

      <Suspense fallback={<HomeFeedSkeleton locale={locale} />}>
        <HomeFeed locale={locale} />
      </Suspense>
    </div>
  );
}

async function HomeFeed({ locale }: { locale: Locale }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "home" });
  await connection();
  const [articles, popular] = await Promise.all([
    getPublishedPosts(5),
    getPopularPosts(5),
  ]);

  if (articles.length === 0) {
    return (
      <p className="rule-anchor mb-16 mt-8 pt-12 text-muted-foreground">
        {t("noPosts")}
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
            <h2 className="headline-sm text-xl">{t("latest")}</h2>
            <Link
              href={localePath("/posts", locale)}
              className="group flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:gap-2.5 hover:text-primary"
            >
              {t("viewAll")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
          {latest.length ? (
            <div className="mt-6 grid gap-6 min-[560px]:grid-cols-2">
              {latest.map((article) => <PostCard key={article.id} post={article} coverAspect="aspect-[5/2]" />)}
            </div>
          ) : (
            <p className="mt-8 text-muted-foreground">{t("morePosts")}</p>
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

function HomeFeedSkeleton({ locale }: { locale: Locale }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "home" });
  return (
    <div className="animate-pulse" aria-label={t("loadingPosts")}>
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
