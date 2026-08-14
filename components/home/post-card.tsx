import Image from "next/image";
import Link from "next/link";
import { createTranslator } from "next-intl";
import { localePath } from "@/i18n/href";
import { displayName } from "@/lib/i18n/display-name";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { GeneratedCover } from "@/components/home/generated-cover";
import { readingMetaValues } from "@/lib/posts/reading-time";

export type PostCardData = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  publishedAt: Date | null;
  pinned?: boolean;
  cover?: string | null;
  categoryName: string | null;
  /** 英文展示名，可空；空时由 displayName 回退到中文。 */
  categoryNameEn?: string | null;
  categorySlug?: string | null;
  charCount: number;
};

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
});

export function PostCard({
  locale,
  post,
  sequenceLabel,
  coverAspect = "aspect-[2/1]",
}: {
  locale: Locale;
  post: PostCardData;
  sequenceLabel?: string;
  coverAspect?: string;
}) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "post" });
  const reading = readingMetaValues(post.charCount);
  return (
    <article className="home-card group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border bg-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:[box-shadow:var(--shadow)]">
      <Link
        href={localePath(`/posts/${post.slug}`, locale)}
        aria-label={post.title}
        tabIndex={-1}
        className={`relative block ${coverAspect} overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
      >
        {post.cover ? (
          <Image
            src={post.cover}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1000px) 35vw, (min-width: 560px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <GeneratedCover
            title={post.title}
            seed={post.slug}
            patternOnly
            className="absolute inset-0"
          />
        )}
        {sequenceLabel ? (
          <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/65 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
            {sequenceLabel}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {post.categoryName ? (
          post.categorySlug ? (
            <Link
              href={localePath(`/categories/${post.categorySlug}`, locale)}
              className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
            >
              {displayName({ name: post.categoryName ?? "", nameEn: post.categoryNameEn }, locale)}
            </Link>
          ) : (
            <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">
              {displayName({ name: post.categoryName ?? "", nameEn: post.categoryNameEn }, locale)}
            </span>
          )
        ) : null}
        <h3 lang="zh-CN" className="headline-sm mt-2.5 text-lg">
          <Link
            href={localePath(`/posts/${post.slug}`, locale)}
            className="rounded-sm group-hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {post.title}
          </Link>
        </h3>
        {post.summary ? (
          <p lang="zh-CN" className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {post.summary}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-xs tabular-nums text-muted-foreground">
          {post.publishedAt ? <time dateTime={post.publishedAt.toISOString()}>{dateFormatter.format(post.publishedAt)}</time> : null}
          <span aria-hidden>·</span>
          <span>{t(reading.key, { minutes: reading.minutes, count: reading.count })}</span>
        </div>
      </div>
    </article>
  );
}

export function PostCardSkeleton() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-[var(--radius-card)] border bg-card"
    >
      <div className="aspect-[2/1] animate-pulse bg-muted" />
      <div className="space-y-4 p-4">
        <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-6 w-4/5 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
