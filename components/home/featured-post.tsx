import Image from "next/image";
import Link from "next/link";
import { GeneratedCover } from "@/components/home/generated-cover";
import type { PostCardData } from "@/components/home/post-card";
import { readingMeta } from "@/lib/posts/reading-time";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
});

export function FeaturedPost({ post }: { post: PostCardData }) {
  return (
    <article className="mt-8 grid overflow-hidden rounded-[var(--radius-card)] border bg-card [box-shadow:var(--shadow)] min-[820px]:grid-cols-[1.05fr_1fr]">
      <div className="relative min-h-60">
        {post.cover ? (
          <Image
            src={post.cover}
            alt={`${post.title}封面`}
            fill
            unoptimized
            priority
            sizes="(min-width: 820px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <GeneratedCover
            title={post.title}
            seed={post.slug}
            patternOnly
            className="absolute inset-0"
          />
        )}
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
        <p className="eyebrow flex items-center gap-2 text-warm before:block before:h-[3px] before:w-6 before:rounded-full before:bg-warm">
          头条
        </p>
        <h2 className="headline mt-4 text-2xl sm:text-4xl">
          <Link
            href={`/posts/${post.slug}`}
            className="bg-[linear-gradient(var(--primary),var(--primary))] bg-[length:0_2px] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-300 hover:bg-[length:100%_2px]"
          >
            {post.title}
          </Link>
        </h2>
        {post.summary ? (
          <p className="mt-4 line-clamp-3 max-w-[34em] leading-[1.8] text-muted-foreground">
            {post.summary}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm tabular-nums text-muted-foreground">
          {post.categoryName ? (
            post.categorySlug ? (
              <Link
                href={`/categories/${post.categorySlug}`}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              >
                {post.categoryName}
              </Link>
            ) : (
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">
                {post.categoryName}
              </span>
            )
          ) : null}
          {post.publishedAt ? <time dateTime={post.publishedAt.toISOString()}>{dateFormatter.format(post.publishedAt)}</time> : null}
          <span aria-hidden className="size-[3px] rounded-full bg-current opacity-50" />
          <span>{readingMeta(post.charCount)}</span>
        </div>
      </div>
    </article>
  );
}
