import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { localePath } from "@/i18n/href";
import { localeAlternates } from "@/i18n/alternates";
import { displayName, displayNameLang } from "@/lib/i18n/display-name";
import { messagesFor } from "@/i18n/messages";
import { htmlLang, type Locale } from "@/i18n/routing";
import { ArticleToc } from "@/components/article/article-toc";
import { ArticleBody } from "@/components/article/article-body";
import { CodeCopyButtons } from "@/components/article/code-copy-buttons";
import { ImageLightbox } from "@/components/article/image-lightbox";
import { MarkPostReadServer } from "@/components/article/mark-post-read-server";
import { PostViewTracker } from "@/components/article/post-view-tracker";
import { ReadingProgress } from "@/components/article/reading-progress";
import { ShareLinkButton } from "@/components/article/share-link-button";
import { SponsorSlot } from "@/components/article/sponsor-slot";
import { GeneratedCover } from "@/components/home/generated-cover";
import { SeriesReadProgress } from "@/components/series/series-read-progress";
import { SubscriptionForm } from "@/components/subscribe/subscription-form";
import { areCommentsEnabled, isSubscriptionEnabled } from "@/lib/features";
import { extractTableOfContents } from "@/lib/markdown/toc";
import {
  getPublishedPost,
  getPublishedPostRedirect,
  getRelatedPosts,
  getSeriesNavForPost,
} from "@/lib/posts/queries";
import { readingMetaValues } from "@/lib/posts/reading-time";
import { CommentsSection } from "./comments-section";

type PageProps = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ commentsPage?: string }> };
const POST_ROUTE_BUILD_PROBE = "__post-route-probe__";

function dateFormatterFor(locale: Locale) {
  return new Intl.DateTimeFormat(htmlLang[locale], {
    dateStyle: "long",
    timeZone: "Asia/Shanghai",
  });
}

// Cache Components needs one representative value before route params can be
// resolved ahead of the streaming boundary. Real slugs remain dynamic and are
// cached after their first request.
export function generateStaticParams() {
  return [{ slug: POST_ROUTE_BUILD_PROBE }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const tMeta = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "post" });
  const { slug } = await params;
  if (slug === POST_ROUTE_BUILD_PROBE) return {};
  const post = await getPublishedPost(slug);
  if (!post) return {};
  const title = post.seoTitle ?? post.title;
  const description = post.seoDescription ?? post.summary;
  const socialImage = `/posts/${encodeURIComponent(post.slug)}/opengraph-image`;
  return {
    title,
    description,
    alternates: post.canonicalUrl
      // 文章自带 canonical 时（转载/合并）以它为准，不再输出语言备用链接。
      ? { canonical: post.canonicalUrl }
      : localeAlternates(`/posts/${post.slug}`, locale as Locale),
    openGraph: {
      type: "article",
      title,
      description,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.authorName],
      images: [{
        url: socialImage,
        width: 1200,
        height: 630,
        alt: tMeta("socialAlt", { title: post.title }),
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: socialImage, alt: tMeta("socialAlt", { title: post.title }) }],
    },
  };
}

type PublishedPost = NonNullable<Awaited<ReturnType<typeof getPublishedPost>>>;

export default async function PostPage({ params, searchParams }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  if (slug === POST_ROUTE_BUILD_PROBE) notFound();
  const post = await getPublishedPost(slug);
  if (!post) {
    const redirectSlug = await getPublishedPostRedirect(slug);
    if (redirectSlug) {
      permanentRedirect(localePath(`/posts/${encodeURIComponent(redirectSlug)}`, locale));
    }
    notFound();
  }

  return (
    <Suspense fallback={<ArticleSkeleton />}>
      <PostContent locale={locale} post={post} searchParams={searchParams} />
    </Suspense>
  );
}

async function PostContent({
  locale,
  post,
  searchParams,
}: {
  locale: Locale;
  post: PublishedPost;
  searchParams: PageProps["searchParams"];
}) {
  setRequestLocale(locale);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "post" });
  const requestedCommentsPage = Number((await searchParams).commentsPage ?? "1");
  const commentsPage = Number.isSafeInteger(requestedCommentsPage) && requestedCommentsPage > 0 ? requestedCommentsPage : 1;

  const [toc, relatedPosts, seriesNavigation] = await Promise.all([
    Promise.resolve(extractTableOfContents(post.contentHtml)),
    getRelatedPosts({
      postId: post.id,
      categorySlug: post.categorySlug,
      seriesId: post.seriesId,
      tagSlugs: post.tags.map((tag) => tag.slug),
    }, 3),
    getSeriesNavForPost(post.id),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const reading = readingMetaValues(post.charCount);
  const dateFormatter = dateFormatterFor(locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Person", name: post.authorName },
    mainEntityOfPage: post.canonicalUrl ?? new URL(
      localePath(`/posts/${encodeURIComponent(post.slug)}`, locale),
      siteUrl,
    ).toString(),
  };

  return (
    <div className="shell">
      <ReadingProgress />
      <PostViewTracker slug={post.slug} />
      <CodeCopyButtons />
      <ImageLightbox />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <article id="article-top" className="mx-auto max-w-[74rem] py-10 sm:py-16">
        <Link
          href={localePath("/posts", locale)}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {t("allPosts")}
        </Link>

        <div className="relative mt-8 h-[clamp(11rem,26vw,17rem)] overflow-hidden rounded-[var(--radius-card)] border [box-shadow:var(--shadow)]">
          {post.cover ? (
            <Image
              src={post.cover}
              alt={t("coverAlt", { title: post.title })}
              fill
              unoptimized
              priority
              sizes="(min-width: 1184px) 1184px, 100vw"
              className="object-cover"
            />
          ) : (
            <GeneratedCover
              title={post.title}
              label={seriesNavigation
                ? t("seriesPosition", {
                  name: displayName(seriesNavigation.series, locale),
                  position: seriesNavigation.position,
                  total: seriesNavigation.total,
                })
                : displayName({ name: post.categoryName ?? "", nameEn: post.categoryNameEn }, locale)}
              alt={t("coverAlt", { title: post.title })}
              seed={post.slug}
              className="absolute inset-0"
            />
          )}
        </div>

        <header className="mt-8">
          {post.categoryName ? (
            post.categorySlug ? (
              <Link
                href={localePath(`/categories/${post.categorySlug}`, locale)}
                className="inline-flex rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              >
                {displayName({ name: post.categoryName, nameEn: post.categoryNameEn }, locale)}
              </Link>
            ) : (
              <span className="inline-flex rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-primary">
                {displayName({ name: post.categoryName, nameEn: post.categoryNameEn }, locale)}
              </span>
            )
          ) : null}

          {/* 标题是文章内容，语言随正文而非界面，浏览器据此提示翻译。 */}
          <h1 lang="zh-CN" className="headline mt-4 max-w-[20em] text-[2.25rem] sm:text-5xl">{post.title}</h1>

          {post.summary ? (
            <p lang="zh-CN" className="mt-6 max-w-[38em] text-lg leading-[1.8] text-muted-foreground">
              {post.summary}
            </p>
          ) : null}

          <div className="mt-8 flex max-w-[42rem] items-center gap-3 border-t border-hairline pt-6">
            {post.authorImage ? (
              <Image
                src={post.authorImage}
                alt={post.authorName}
                width={40}
                height={40}
                unoptimized
                className="size-10 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,var(--primary),var(--warm))] font-bold text-white">
                {post.authorName.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <p lang="zh-CN" className="text-sm font-semibold">{post.authorName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
                {post.publishedAt ? (
                  <time dateTime={post.publishedAt.toISOString()}>
                    {dateFormatter.format(post.publishedAt)}
                  </time>
                ) : null}
                <span aria-hidden>·</span>
                <span>{t(reading.key, { minutes: reading.minutes, count: reading.count })}</span>
                <span aria-hidden>·</span>
                <span>{t("revision", { n: post.revision })}</span>
              </div>
            </div>
          </div>

          {post.tags.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={localePath(`/tags/${tag.slug}`, locale)}
                  className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
                >
                  #{displayName(tag, locale)}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        <div className="mt-12 grid gap-10 min-[1040px]:grid-cols-[minmax(0,1fr)_19rem] min-[1040px]:items-start min-[1040px]:gap-16 min-[1440px]:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            {toc.length ? (
              <details className="rounded-[var(--radius-card)] border bg-card p-4 min-[1040px]:hidden">
                <summary className="cursor-pointer font-semibold">{t("tocLabel")}</summary>
                <div className="mt-4 border-t pt-4">
                  <ArticleToc items={toc} compact />
                </div>
              </details>
            ) : null}

            <ArticleBody
              html={post.contentHtml}
              className={`article-body prose prose-zinc dark:prose-invert prose-headings:scroll-mt-24 prose-a:text-primary prose-a:underline-offset-4 prose-code:before:content-none prose-code:after:content-none ${
                toc.length ? "mt-10 min-[1040px]:mt-0" : ""
              }`}
            />
            {/* 哨兵紧跟正文:它进入视口就说明读者翻到了文末。
                只对登录用户渲染,所以是个动态洞,得单独包 Suspense。 */}
            <Suspense fallback={null}>
              <MarkPostReadServer slug={post.slug} />
            </Suspense>
          </div>

          {/* 目录区可滚动,下方的操作与赞助位钉在底部不跟着滚——
              否则目录一长,它们就被卷进滚动区里看不见了。 */}
          <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] flex-col min-[1040px]:flex">
            {toc.length ? (
              <div className="toc-scroll min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-card)] bg-muted/55 p-4 pr-2.5">
                <p className="eyebrow mb-4 text-foreground/70">{t("toc")}</p>
                <ArticleToc items={toc} />
              </div>
            ) : null}

            <div className="mt-6 flex shrink-0 flex-col items-start gap-3 border-t pt-5">
              <ShareLinkButton />
              <a href="#article-top" className="text-sm text-muted-foreground hover:text-primary">{t("backToTop")}</a>
            </div>

            <SponsorSlot locale={locale} />
          </aside>
        </div>

        {/* 窄屏 aside 整个不渲染,赞助位在这里补一份,落在读完正文的自然停顿处。 */}
        <SponsorSlot locale={locale} variant="inline" />

        {seriesNavigation ? (
          <SeriesNavigation locale={locale} navigation={seriesNavigation} />
        ) : null}

        {areCommentsEnabled() ? (
          <Suspense fallback={<div className="mt-12 h-56 animate-pulse rounded-[var(--radius-card)] border bg-muted/50" />}>
            <CommentsSection locale={locale} postId={post.id} slug={post.slug} page={commentsPage} />
          </Suspense>
        ) : null}

        {relatedPosts.length ? (
          <section className="rule-anchor mt-12 pt-5">
            <h2 className="headline-sm text-xl">{t("related")}</h2>
            <RelatedPosts locale={locale} posts={relatedPosts} />
          </section>
        ) : null}

        {isSubscriptionEnabled() ? <div className="mt-12"><SubscriptionForm /></div> : null}
      </article>
    </div>
  );
}

function SeriesNavigation({
  locale,
  navigation,
}: {
  locale: Locale;
  navigation: NonNullable<Awaited<ReturnType<typeof getSeriesNavForPost>>>;
}) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "post" });
  return (
    <nav
      aria-label={t("seriesNav")}
      className="mt-12 rounded-[var(--radius-card)] border bg-card p-5 [box-shadow:var(--shadow)] sm:p-6"
    >
      <p className="text-sm text-muted-foreground">
        {t("inSeries")}
        <Link
          href={localePath(`/series/${navigation.series.slug}`, locale)}
          lang={displayNameLang(navigation.series, locale)}
          className="mx-1 font-semibold text-foreground hover:text-primary"
        >
          {t("seriesName", { name: displayName(navigation.series, locale) })}
        </Link>
        {t.rich("seriesPart", {
          n: () => <span className="tabular-nums">{navigation.position} / {navigation.total}</span>,
        })}
      </p>
      <div className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
        {navigation.prev ? (
          <Link href={localePath(`/posts/${navigation.prev.slug}`, locale)} className="group">
            <span className="eyebrow text-muted-foreground">{t("previous")}</span>
            <span className="mt-2 block text-sm font-semibold leading-6 group-hover:text-primary">
              {navigation.prev.title}
            </span>
          </Link>
        ) : <span />}
        {navigation.next ? (
          <Link href={localePath(`/posts/${navigation.next.slug}`, locale)} className="group sm:text-right">
            <span className="eyebrow text-muted-foreground">{t("next")}</span>
            <span className="mt-2 block text-sm font-semibold leading-6 group-hover:text-primary">
              {navigation.next.title}
            </span>
          </Link>
        ) : null}
      </div>
      <Suspense fallback={null}>
        <SeriesReadProgress
          locale={locale}
          seriesSlug={navigation.series.slug}
          postIds={navigation.postIds}
          className="mt-5 border-t pt-5"
        />
      </Suspense>
    </nav>
  );
}

function RelatedPosts({
  locale,
  posts,
}: {
  locale: Locale;
  posts: Awaited<ReturnType<typeof getRelatedPosts>>;
}) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "post" });
  return (
    <ul className="mt-5 grid gap-4 sm:grid-cols-3">
      {posts.map((post) => {
        const reading = readingMetaValues(post.charCount);
        return (
          <li key={post.id} className="min-w-0">
            <Link
              href={localePath(`/posts/${post.slug}`, locale)}
              className="home-card group flex h-full flex-col rounded-xl border bg-card p-4 transition-[transform,box-shadow,border-color] hover:-translate-y-1 hover:border-primary/40 hover:[box-shadow:var(--shadow)]"
            >
              <span className="eyebrow text-primary">{post.categoryName ? displayName({ name: post.categoryName, nameEn: post.categoryNameEn }, locale) : t("breadcrumbPosts")}</span>
              <span lang="zh-CN" className="mt-2 block text-sm font-bold leading-6 group-hover:text-primary">{post.title}</span>
              <span className="mt-auto block pt-3 text-xs text-muted-foreground">
                {t(reading.key, { minutes: reading.minutes, count: reading.count })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ArticleSkeleton() {
  return (
    <div className="shell py-16 sm:py-24">
      {/* 宽度与对齐必须和 <article> 一致,否则加载完成时整块内容会横向跳一下。 */}
      <div className="mx-auto max-w-[74rem] animate-pulse">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="mt-8 h-64 rounded-[var(--radius-card)] bg-muted" />
        <div className="mt-8 h-6 w-20 rounded-full bg-muted" />
        <div className="mt-4 h-11 w-full max-w-3xl rounded bg-muted" />
        <div className="mt-3 h-11 w-3/5 rounded bg-muted" />
        <div className="mt-12 grid gap-16 min-[1040px]:grid-cols-[minmax(0,1fr)_19rem] min-[1440px]:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="h-96 rounded bg-muted" />
          <div className="hidden h-72 rounded bg-muted min-[1040px]:block" />
        </div>
      </div>
    </div>
  );
}
