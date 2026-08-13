import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PageJump } from "@/components/browse/page-jump";
import { PostCard, PostCardSkeleton, type PostCardData } from "@/components/home/post-card";
import { getPublishedPosts } from "@/lib/posts/queries";

const YEAR_PAGE_SIZE = 6;

type ArchiveSearchParams = { year?: string; page?: string };
type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<ArchiveSearchParams> };

const yearFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

// 归档目前上限 100 篇,超过需改为分年/分页查询。
const ARCHIVE_LIMIT = 100;

/** 无发布日期的分组键，不进字典：它同时是 URL 里的分组标识。 */
const UNKNOWN_YEAR = "unknown-year";

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "archive" });
  const { year, page } = await searchParams;
  const paged = Boolean(year || page);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/posts" },
    // 分页态是同一批文章的切片,避免被当作重复薄页收录。
    ...(paged ? { robots: { index: false, follow: true } } : {}),
  };
}

export default function PostsPage(props: PageProps) {
  return (
    <div className="shell py-10 sm:py-16">
      <Suspense fallback={<ArchiveSkeleton />}>
        <PostArchive {...props} />
      </Suspense>
    </div>
  );
}

async function PostArchive({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "archive" });
  const tc = createTranslator({ locale, messages, namespace: "common" });
  await connection();
  const query = await searchParams;
  const posts = await getPublishedPosts(ARCHIVE_LIMIT);

  if (posts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} countLabel={tc("postCount", { count: 0 })} />
        <p className="rule-anchor mt-12 pt-12 text-muted-foreground">{t("empty")}</p>
      </>
    );
  }

  const groups = new Map<string, PostCardData[]>();
  for (const post of posts) {
    const year = post.publishedAt ? yearFormatter.format(post.publishedAt) : UNKNOWN_YEAR;
    const bucket = groups.get(year);
    if (bucket) {
      bucket.push(post);
    } else {
      groups.set(year, [post]);
    }
  }

  // 单一「活动年份」:仅该年切换到指定页,其余年份显示第 1 页。
  const activeYear = query.year;
  const requestedPage = Math.trunc(Number(query.page));
  const activePage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} countLabel={tc("postCount", { count: posts.length })} />

      <div className="mt-12 space-y-16">
        {[...groups.entries()].map(([year, yearPosts]) => {
          const yearKey = year === UNKNOWN_YEAR ? "unknown" : year;
          const totalPages = Math.max(1, Math.ceil(yearPosts.length / YEAR_PAGE_SIZE));
          const currentPage = activeYear === yearKey ? Math.min(activePage, totalPages) : 1;
          const start = (currentPage - 1) * YEAR_PAGE_SIZE;
          const pagePosts = yearPosts.slice(start, start + YEAR_PAGE_SIZE);

          return (
            <section key={yearKey} id={`year-${yearKey}`} className="scroll-mt-28">
              <div className="rule-anchor flex items-baseline justify-between pt-5">
                <h2 className="date-anchor text-3xl tabular-nums sm:text-4xl">{year}</h2>
                <span className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground tabular-nums">
                  {tc("postCount", { count: yearPosts.length })}
                </span>
              </div>
              <div className="mt-6 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
                {pagePosts.map((post) => (
                  <PostCard locale={locale} key={post.id} post={post} />
                ))}
              </div>
              {totalPages > 1 ? (
                <YearPager
                  locale={locale}
                  yearKey={yearKey}
                  year={year}
                  currentPage={currentPage}
                  totalPages={totalPages}
                />
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}

const pagerLink =
  "rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const pagerDisabled =
  "rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums text-muted-foreground opacity-50";
const pagerActive =
  "rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-semibold tabular-nums text-primary-foreground";

function YearPager({
  locale,
  yearKey,
  year,
  currentPage,
  totalPages,
}: {
  locale: Locale;
  yearKey: string;
  year: string;
  currentPage: number;
  totalPages: number;
}) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "archive" });
  const hrefFor = (page: number) =>
    localePath(`/posts?year=${encodeURIComponent(yearKey)}&page=${page}#year-${yearKey}`, locale);

  return (
    <nav
      aria-label={t("yearPagination", { year })}
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      {currentPage > 1 ? (
        <Link href={hrefFor(currentPage - 1)} rel="prev" className={pagerLink}>
          {t("previousPage")}
        </Link>
      ) : (
        <span aria-disabled className={pagerDisabled}>{t("previousPage")}</span>
      )}

      {pageList(currentPage, totalPages).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} aria-hidden className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : entry === currentPage ? (
          <span key={entry} aria-current="page" className={pagerActive}>
            {entry}
          </span>
        ) : (
          <Link key={entry} href={hrefFor(entry)} className={pagerLink}>
            {entry}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link href={hrefFor(currentPage + 1)} rel="next" className={pagerLink}>
          {t("nextPage")}
        </Link>
      ) : (
        <span aria-disabled className={pagerDisabled}>{t("nextPage")}</span>
      )}

      {totalPages > 1 ? (
        <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />
      ) : null}
      <PageJump key={currentPage} yearKey={yearKey} totalPages={totalPages} currentPage={currentPage} />
    </nav>
  );
}

function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const wanted = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const pages = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  let previous = 0;
  for (const page of pages) {
    if (page - previous > 1) result.push("gap");
    result.push(page);
    previous = page;
  }
  return result;
}

function ArchiveSkeleton() {
  return (
    <div aria-label="Loading">
      <div className="h-12 w-56 animate-pulse rounded bg-muted" />
      <div className="rule-anchor mt-12 pt-5">
        <div className="h-10 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-6 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    </div>
  );
}
