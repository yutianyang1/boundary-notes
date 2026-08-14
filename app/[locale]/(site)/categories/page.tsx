import type { Metadata } from "next";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { localeAlternates } from "@/i18n/alternates";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { TermCard } from "@/components/browse/term-card";
import { getPublishedCategoryList } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "categories" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates("/categories", locale as Locale),
  };
}

export default async function CategoriesPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "categories" });

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Suspense fallback={<TermGridSkeleton />}>
        <CategoryList locale={locale} />
      </Suspense>
    </div>
  );
}

async function CategoryList({ locale }: { locale: Locale }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "categories" });
  const tc = createTranslator({ locale, messages: messagesFor(locale), namespace: "common" });
  await connection();
  const categories = await getPublishedCategoryList();
  if (!categories.length) {
    return <p className="rule-anchor mt-12 pt-12 text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
      {categories.map((category) => (
        <TermCard
          key={category.slug}
          href={localePath(`/categories/${category.slug}`, locale)}
          name={category.name}
          description={category.description}
          countLabel={tc("postCount", { count: category.count })}
          seed={category.slug}
          label={t("title")}
        />
      ))}
    </div>
  );
}

function TermGridSkeleton() {
  return (
    <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="overflow-hidden rounded-[var(--radius-card)] border bg-card">
          <div className="aspect-video animate-pulse bg-muted" />
          <div className="space-y-4 p-5">
            <div className="h-7 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
