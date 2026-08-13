import { MailCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { authRichTags } from "@/components/auth/rich-tags";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { verifyEmailAction } from "./actions";



type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.verifyEmail" });
  return { title: t("metaTitle") };
}

export default function VerifyEmailPage(props: PageProps) {
  return <Suspense fallback={<AuthSplitSkeleton />}><VerifyEmailContent {...props} /></Suspense>;
}

async function VerifyEmailContent({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "auth.verifyEmail" });
  await connection();
  if (!isPublicRegistrationEnabled()) notFound();
  const token = (await searchParams).token;
  if (!token || token.length < 20) notFound();
  return (
    <AuthSplit
      panelEyebrow={t("eyebrow")}
      panelTitle={t.rich("panelTitle", authRichTags)}
      panelDescription={t("panelDescription")}
    >
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary">
          <MailCheck aria-hidden className="size-7" />
        </span>
        <h1 className="headline-sm mt-5 text-3xl">{t("title")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          {t("lead")}
        </p>
        <form action={verifyEmailAction} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <button className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {t("submit")}
          </button>
        </form>
      </div>
    </AuthSplit>
  );
}
