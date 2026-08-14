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
import { SubscriptionForm } from "@/components/subscribe/subscription-form";
import { isSubscriptionEnabled } from "@/lib/features";
import { unsubscribe } from "@/lib/subscribe/service";

type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<{ id?: string; token?: string }> };

export default function UnsubscribePage(props: PageProps) {
  return <Suspense fallback={<ResultSkeleton />}><UnsubscribeResult {...props} /></Suspense>;
}

async function UnsubscribeResult({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "subscribe" });
  await connection();
  if (!isSubscriptionEnabled()) notFound();
  const { id = "", token = "" } = await searchParams;
  const success = await unsubscribe(id, token);

  return (
    <div className="shell py-12 sm:py-20">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={success ? t("unsubscribedTitle") : t("unsubscribeInvalidTitle")}
        description={success
          ? t("unsubscribedDescription")
          : t("unsubscribeInvalidDescription")}
      />
      <div className="mt-8 max-w-[52rem]">
        {success ? <SubscriptionForm /> : (
          <div className="rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
            <Link href={localePath("/", locale)} className="text-sm font-semibold text-primary hover:underline">{t("backHome")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return <div className="shell py-12 sm:py-20"><div className="h-44 max-w-[52rem] animate-pulse rounded-[var(--radius-card)] bg-muted" /></div>;
}
