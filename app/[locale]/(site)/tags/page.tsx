import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { localeAlternates } from "@/i18n/alternates";
import { displayName } from "@/lib/i18n/display-name";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { getPublishedTagCloud } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "tags" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates("/tags", locale as Locale),
  };
}

export default async function TagsPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "tags" });

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Suspense fallback={<div className="mt-10 h-28 animate-pulse rounded-[var(--radius-card)] bg-muted" />}>
        <TagCloud locale={locale} />
      </Suspense>
    </div>
  );
}

async function TagCloud({ locale }: { locale: Locale }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "tags" });
  await connection();
  const tags = await getPublishedTagCloud();
  if (!tags.length) return <p className="rule-anchor mt-12 pt-12 text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="rule-anchor mt-12 flex flex-wrap gap-3 pt-6">
      {tags.map((tag) => (
        <Link
          key={tag.slug}
          href={localePath(`/tags/${tag.slug}`, locale)}
          className="group inline-flex items-center gap-2 rounded-full border bg-card px-5 py-3 font-semibold transition-[border-color,box-shadow,color] hover:border-primary hover:text-primary hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>#{displayName(tag, locale)}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-primary">
            {tag.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
