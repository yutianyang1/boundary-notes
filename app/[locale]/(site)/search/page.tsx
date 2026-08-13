import type { Metadata } from "next";
import { Search } from "lucide-react";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PostCard, PostCardSkeleton } from "@/components/home/post-card";
import { searchPublishedPosts } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "search" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "search" });

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <Suspense fallback={<SearchFormMarkup locale={locale} />}>
        <SearchForm locale={locale} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<SearchSkeleton />}>
        <SearchResults locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchForm({ locale, searchParams }: { locale: Locale; searchParams: Promise<{ q?: string }> }) {
  const query = ((await searchParams).q ?? "").normalize("NFKC").trim().slice(0, 100);
  return <SearchFormMarkup locale={locale} query={query} />;
}

function SearchFormMarkup({ locale, query = "" }: { locale: Locale; query?: string }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "search" });
  return (
    <form action={localePath("/search", locale)} className="mt-8 flex max-w-3xl gap-3">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{t("submit")}</span>
        <Search aria-hidden className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          maxLength={100}
          defaultValue={query}
          placeholder={t("placeholder")}
          className="h-12 w-full rounded-full border bg-card pl-12 pr-4 outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </label>
      <button className="h-12 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        {t("title")}
      </button>
    </form>
  );
}

async function SearchResults({ locale, searchParams }: { locale: Locale; searchParams: Promise<{ q?: string }> }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "search" });
  await connection();
  const query = ((await searchParams).q ?? "").normalize("NFKC").trim().slice(0, 100);
  if (!query) return <p className="rule-anchor mt-12 pt-12 text-muted-foreground">{t("prompt")}</p>;

  const posts = await searchPublishedPosts(query);
  return (
    <section className="rule-anchor mt-12 pt-6">
      <h2 className="text-sm text-muted-foreground">
        {t.rich("resultsFor", {
          query,
          n: () => <span className="font-semibold tabular-nums text-foreground">{posts.length}</span>,
        })}
      </h2>
      {posts.length ? (
        <div className="mt-6 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {posts.map((post) => <PostCard locale={locale} key={post.id} post={post} />)}
        </div>
      ) : (
        <p className="mt-8 rounded-lg border bg-card p-6 text-muted-foreground">{t("noResults")}</p>
      )}
    </section>
  );
}

function SearchSkeleton() {
  return (
    <div className="rule-anchor mt-12 grid gap-6 pt-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}
