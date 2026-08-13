import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleToc } from "@/components/article/article-toc";
import { ArticleBody } from "@/components/article/article-body";
import { CodeCopyButtons } from "@/components/article/code-copy-buttons";
import { ImageLightbox } from "@/components/article/image-lightbox";
import { PostViewTracker } from "@/components/article/post-view-tracker";
import { ReadingProgress } from "@/components/article/reading-progress";
import { ShareLinkButton } from "@/components/article/share-link-button";
import { SponsorSlot } from "@/components/article/sponsor-slot";
import { GeneratedCover } from "@/components/home/generated-cover";
import { SubscriptionForm } from "@/components/subscribe/subscription-form";
import { areCommentsEnabled, isSubscriptionEnabled } from "@/lib/features";
import { extractTableOfContents } from "@/lib/markdown/toc";
import {
  getPublishedPost,
  getRelatedPosts,
  getSeriesNavForPost,
} from "@/lib/posts/queries";
import { readingMeta } from "@/lib/posts/reading-time";
import { CommentsSection } from "./comments-section";

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ commentsPage?: string }> };

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "long",
  timeZone: "Asia/Shanghai",
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return {};
  const title = post.seoTitle ?? post.title;
  const description = post.seoDescription ?? post.summary;
  const socialImage = `/posts/${encodeURIComponent(post.slug)}/opengraph-image`;
  return {
    title,
    description,
    alternates: { canonical: post.canonicalUrl ?? `/posts/${post.slug}` },
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
        alt: `${post.title}社交分享卡片`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: socialImage, alt: `${post.title}社交分享卡片` }],
    },
  };
}

export default function PostPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<ArticleSkeleton />}>
      <PostContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PostContent({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();
  const requestedCommentsPage = Number((await searchParams).commentsPage ?? "1");
  const commentsPage = Number.isSafeInteger(requestedCommentsPage) && requestedCommentsPage > 0 ? requestedCommentsPage : 1;

  const [toc, relatedPosts, seriesNavigation] = await Promise.all([
    Promise.resolve(extractTableOfContents(post.contentHtml)),
    getRelatedPosts(post.id, post.categorySlug, 3),
    getSeriesNavForPost(post.id),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Person", name: post.authorName },
    mainEntityOfPage: post.canonicalUrl ?? `${siteUrl}/posts/${post.slug}`,
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
          href="/posts"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          ← 全部文章
        </Link>

        <div className="relative mt-8 h-[clamp(11rem,26vw,17rem)] overflow-hidden rounded-[var(--radius-card)] border [box-shadow:var(--shadow)]">
          {post.cover ? (
            <Image
              src={post.cover}
              alt={`${post.title}封面`}
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
                ? `系列 · 《${seriesNavigation.series.name}》 · 第 ${seriesNavigation.position} / ${seriesNavigation.total} 篇`
                : post.categoryName}
              seed={post.slug}
              className="absolute inset-0"
            />
          )}
        </div>

        <header className="mt-8">
          {post.categoryName ? (
            post.categorySlug ? (
              <Link
                href={`/categories/${post.categorySlug}`}
                className="inline-flex rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              >
                {post.categoryName}
              </Link>
            ) : (
              <span className="inline-flex rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-primary">
                {post.categoryName}
              </span>
            )
          ) : null}

          {/* 标题是文章内容，语言随正文而非界面，浏览器据此提示翻译。 */}
          <h1 lang="zh-CN" className="headline mt-4 max-w-[20em] text-[2.25rem] sm:text-5xl">{post.title}</h1>

          {post.summary ? (
            <p className="mt-6 max-w-[38em] text-lg leading-[1.8] text-muted-foreground">
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
              <p className="text-sm font-semibold">{post.authorName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
                {post.publishedAt ? (
                  <time dateTime={post.publishedAt.toISOString()}>
                    {dateFormatter.format(post.publishedAt)}
                  </time>
                ) : null}
                <span aria-hidden>·</span>
                <span>{readingMeta(post.charCount)}</span>
                <span aria-hidden>·</span>
                <span>第 {post.revision} 版</span>
              </div>
            </div>
          </div>

          {post.tags.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={`/tags/${tag.slug}`}
                  className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        <div className="mt-12 grid gap-10 min-[1040px]:grid-cols-[minmax(0,1fr)_19rem] min-[1040px]:items-start min-[1040px]:gap-16 min-[1440px]:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            {toc.length ? (
              <details className="rounded-[var(--radius-card)] border bg-card p-4 min-[1040px]:hidden">
                <summary className="cursor-pointer font-semibold">文章目录</summary>
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
          </div>

          {/* 目录区可滚动,下方的操作与赞助位钉在底部不跟着滚——
              否则目录一长,它们就被卷进滚动区里看不见了。 */}
          <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] flex-col min-[1040px]:flex">
            {toc.length ? (
              <div className="toc-scroll min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-card)] bg-muted/55 p-4 pr-2.5">
                <p className="eyebrow mb-4 text-foreground/70">目录</p>
                <ArticleToc items={toc} />
              </div>
            ) : null}

            <div className="mt-6 flex shrink-0 flex-col items-start gap-3 border-t pt-5">
              <ShareLinkButton />
              <a href="#article-top" className="text-sm text-muted-foreground hover:text-primary">↑ 返回顶部</a>
            </div>

            <SponsorSlot />
          </aside>
        </div>

        {/* 窄屏 aside 整个不渲染,赞助位在这里补一份,落在读完正文的自然停顿处。 */}
        <SponsorSlot variant="inline" />

        {seriesNavigation ? (
          <SeriesNavigation navigation={seriesNavigation} />
        ) : null}

        {areCommentsEnabled() ? (
          <Suspense fallback={<div className="mt-12 h-56 animate-pulse rounded-[var(--radius-card)] border bg-muted/50" />}>
            <CommentsSection postId={post.id} slug={post.slug} page={commentsPage} />
          </Suspense>
        ) : null}

        {relatedPosts.length ? (
          <section className="rule-anchor mt-12 pt-5">
            <h2 className="headline-sm text-xl">相关文章</h2>
            <RelatedPosts posts={relatedPosts} />
          </section>
        ) : null}

        {isSubscriptionEnabled() ? <div className="mt-12"><SubscriptionForm /></div> : null}
      </article>
    </div>
  );
}

function SeriesNavigation({
  navigation,
}: {
  navigation: NonNullable<Awaited<ReturnType<typeof getSeriesNavForPost>>>;
}) {
  return (
    <nav
      aria-label="系列文章导航"
      className="mt-12 rounded-[var(--radius-card)] border bg-card p-5 [box-shadow:var(--shadow)] sm:p-6"
    >
      <p className="text-sm text-muted-foreground">
        本文属于系列
        <Link
          href={`/series/${navigation.series.slug}`}
          className="mx-1 font-semibold text-foreground hover:text-primary"
        >
          《{navigation.series.name}》
        </Link>
        · 第 <span className="tabular-nums">{navigation.position} / {navigation.total}</span> 篇
      </p>
      <div className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
        {navigation.prev ? (
          <Link href={`/posts/${navigation.prev.slug}`} className="group">
            <span className="eyebrow text-muted-foreground">上一篇</span>
            <span className="mt-2 block text-sm font-semibold leading-6 group-hover:text-primary">
              {navigation.prev.title}
            </span>
          </Link>
        ) : <span />}
        {navigation.next ? (
          <Link href={`/posts/${navigation.next.slug}`} className="group sm:text-right">
            <span className="eyebrow text-muted-foreground">下一篇</span>
            <span className="mt-2 block text-sm font-semibold leading-6 group-hover:text-primary">
              {navigation.next.title}
            </span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

function RelatedPosts({
  posts,
}: {
  posts: Awaited<ReturnType<typeof getRelatedPosts>>;
}) {
  return (
    <ul className="mt-5 grid gap-4 sm:grid-cols-3">
      {posts.map((post) => (
        <li key={post.id} className="min-w-0">
          <Link
            href={`/posts/${post.slug}`}
            className="home-card group flex h-full flex-col rounded-xl border bg-card p-4 transition-[transform,box-shadow,border-color] hover:-translate-y-1 hover:border-primary/40 hover:[box-shadow:var(--shadow)]"
          >
            <span className="eyebrow text-primary">{post.categoryName ?? "文章"}</span>
            <span className="mt-2 block text-sm font-bold leading-6 group-hover:text-primary">{post.title}</span>
            <span className="mt-auto block pt-3 text-xs text-muted-foreground">{readingMeta(post.charCount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ArticleSkeleton() {
  return (
    <div className="shell py-16 sm:py-24" aria-label="正在加载文章">
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
