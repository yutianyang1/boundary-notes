import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PostCard, PostCardSkeleton } from "@/components/home/post-card";
import { getPublishedPostsByCategory } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug: rawSlug } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "categories" });
  const result = await getPublishedPostsByCategory(decodeURIComponent(rawSlug));
  if (!result) return {};
  return {
    title: result.category.name,
    description: result.category.description || t("metaFallback", { name: result.category.name }),
    alternates: localeAlternates(`/categories/${rawSlug}`, locale as Locale),
  };
}

export default function CategoryPage({ params }: PageProps) {
  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryContent params={params} />
    </Suspense>
  );
}

async function CategoryContent({ params }: PageProps) {
  const { locale: rawLocale, slug: rawSlug } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "categories" });
  const tc = createTranslator({ locale, messages, namespace: "common" });
  await connection();
  const result = await getPublishedPostsByCategory(decodeURIComponent(rawSlug));
  if (!result) notFound();

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={result.category.name}
        description={result.category.description}
        countLabel={tc("postCount", { count: result.posts.length })}
      />
      {result.posts.length ? (
        <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {result.posts.map((post) => <PostCard locale={locale} key={post.id} post={post} />)}
        </div>
      ) : (
        <p className="rule-anchor mt-12 pt-12 text-muted-foreground">{t("emptyPosts")}</p>
      )}
    </div>
  );
}

function CategorySkeleton() {
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
