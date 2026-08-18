import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { displayDescription, displayName } from "@/lib/i18n/display-name";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PostCard, PostCardSkeleton } from "@/components/home/post-card";
import { PostReadBadge } from "@/components/series/post-read-badge";
import { SeriesProgressView, SeriesSignInPrompt } from "@/components/series/series-read-progress";
import { auth } from "@/auth";
import { getPublishedSeries } from "@/lib/posts/queries";
import { readPostsAmong } from "@/lib/posts/read-progress";

type PageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug: rawSlug } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "series" });
  const result = await getPublishedSeries(decodeURIComponent(rawSlug));
  if (!result) return {};
  return {
    title: displayName(result.series, locale as Locale),
    description: displayDescription(result.series, locale as Locale)
      || t("metaFallback", { name: displayName(result.series, locale as Locale) }),
    alternates: localeAlternates(`/series/${rawSlug}`, locale as Locale),
  };
}

export default function SeriesDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<SeriesSkeleton />}>
      <SeriesContent params={params} />
    </Suspense>
  );
}

async function SeriesContent({ params }: PageProps) {
  const { locale: rawLocale, slug: rawSlug } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "series" });
  const tc = createTranslator({ locale, messages, namespace: "common" });
  await connection();
  const result = await getPublishedSeries(decodeURIComponent(rawSlug));
  if (!result) notFound();
  // 已读集合取一次:进度条和每张卡的角标都用它,不重复查。
  const session = await auth();
  const readIds = await readPostsAmong(session?.user?.id, result.posts.map((post) => post.id));

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={displayName(result.series, locale)}
        description={displayDescription(result.series, locale)}
        countLabel={tc("postCount", { count: result.posts.length })}
      />
      {result.posts.length ? (
        <>
          {session?.user?.id ? (
            <SeriesProgressView
              locale={locale}
              seriesSlug={result.series.slug}
              read={readIds.size}
              total={result.posts.length}
              className="rule-anchor mt-8 pt-6"
            />
          ) : (
            <SeriesSignInPrompt
              locale={locale}
              seriesSlug={result.series.slug}
              className="rule-anchor mt-8 pt-6"
            />
          )}
          <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
            {result.posts.map((post, index) => (
              <PostCard
                locale={locale}
                key={post.id}
                post={post}
                sequenceLabel={t("sequenceLabel", { n: post.seriesOrder ?? index + 1 })}
                overlay={readIds.has(post.id) ? <PostReadBadge locale={locale} /> : null}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="rule-anchor mt-12 pt-12 text-muted-foreground">{t("emptyPosts")}</p>
      )}
    </div>
  );
}

function SeriesSkeleton() {
  return (
    <div className="shell py-16">
      <div className="h-12 w-56 animate-pulse rounded bg-muted" />
      <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    </div>
  );
}
