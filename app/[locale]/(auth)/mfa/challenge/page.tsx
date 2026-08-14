import { redirect } from "next/navigation";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { safeLocalRedirect } from "@/lib/auth/redirect";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { MfaChallengeForm } from "../mfa-form";

type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<{ callbackUrl?: string }> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.mfa" });
  return { title: t("challengeMetaTitle") };
}

export default function MfaChallengePage(props: PageProps) {
  return <Suspense fallback={<MfaPageSkeleton />}><MfaChallengeContent {...props} /></Suspense>;
}

async function MfaChallengeContent({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "auth.mfa" });
  await connection();
  const session = await auth();
  if (!session?.user) redirect(localePath("/login", locale));
  if (session.authState === "mfa_enrollment_required") redirect(localePath("/mfa/enroll", locale));
  if (session.authState === "full") redirect(localePath(session.user.role === "reader" ? "/account" : "/admin", locale));
  const query = await searchParams;
  const redirectTo = query.callbackUrl
    ? safeLocalRedirect(query.callbackUrl)
    : session.user.role === "reader" ? "/account" : "/admin";
  return (
    <main className="shell grid min-h-[70vh] place-items-center py-12">
      <section className="w-full max-w-md rounded-[var(--radius-card)] border bg-card p-7 [box-shadow:var(--shadow)]">
        <p className="eyebrow text-primary">{t("challengeEyebrow")}</p>
        <h1 className="headline-sm mt-3 text-3xl">{t("challengePanelTitle")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("challengeLead")}</p>
        <MfaChallengeForm locale={locale} redirectTo={redirectTo} />
        <div className="mt-4 text-center">
          <SignOutButton redirectTo={localePath("/login", locale)} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">{t("cancelAndSignOut")}</SignOutButton>
        </div>
      </section>
    </main>
  );
}

function MfaPageSkeleton() {
  return <main className="shell grid min-h-[70vh] place-items-center py-12"><div className="h-96 w-full max-w-md animate-pulse rounded-[var(--radius-card)] bg-muted" /></main>;
}
