import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { isSubscriptionEnabled } from "@/lib/features";
import { confirmSubscription } from "@/lib/subscribe/service";

type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> };

export default function ConfirmSubscriptionPage(props: PageProps) {
  return <Suspense fallback={<ResultSkeleton />}><ConfirmResult {...props} /></Suspense>;
}

async function ConfirmResult({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "subscribe" });
  await connection();
  if (!isSubscriptionEnabled()) notFound();
  const { token = "" } = await searchParams;
  const confirmed = await confirmSubscription(token);

  return (
    <div className="shell py-12 sm:py-20">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={confirmed ? t("confirmedTitle") : t("invalidTitle")}
        description={confirmed ? t("confirmedDescription") : t("invalidDescription")}
      />
      <div className="mt-8 max-w-[52rem] rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
        <Link href={localePath("/", locale)} className="text-sm font-semibold text-primary hover:underline">{t("backHome")}</Link>
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return <div className="shell py-12 sm:py-20"><div className="h-44 max-w-[52rem] animate-pulse rounded-[var(--radius-card)] bg-muted" /></div>;
}
