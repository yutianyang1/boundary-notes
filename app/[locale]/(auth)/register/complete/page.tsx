import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { authRichTags } from "@/components/auth/rich-tags";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { digestActionToken } from "@/lib/auth/action-tokens";
import { db } from "@/lib/db";
import { pendingRegistrations } from "@/lib/db/schema";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { CompleteRegistrationForm } from "./complete-registration-form";



function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.completeRegistration" });
  return { title: t("metaTitle") };
}

export default function CompleteRegistrationPage(props: PageProps) {
  return <Suspense fallback={<AuthSplitSkeleton />}><CompleteRegistrationContent {...props} /></Suspense>;
}

async function CompleteRegistrationContent({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "auth.completeRegistration" });
  await connection();
  if (!isPublicRegistrationEnabled()) notFound();
  const token = (await searchParams).token;
  if (!token || token.length < 20) notFound();
  const [pending] = await db.select({ email: pendingRegistrations.email }).from(pendingRegistrations).where(and(
    eq(pendingRegistrations.tokenDigest, digestActionToken(token)),
    isNotNull(pendingRegistrations.verifiedAt),
    isNull(pendingRegistrations.consumedAt),
    gt(pendingRegistrations.expiresAt, new Date()),
  )).limit(1);
  if (!pending) notFound();

  return (
    <AuthSplit
      panelEyebrow={t("eyebrow")}
      panelTitle={t.rich("panelTitle", authRichTags)}
      panelDescription={t("panelDescription")}
      points={[t("point1"), t("point2")]}
    >
      <div>
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-primary"><CheckCircle2 aria-hidden className="size-6" /></span>
        <p className="eyebrow mt-5 text-primary">{maskEmail(pending.email)}</p>
        <h1 className="headline-sm mt-3 text-3xl">{t("title")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("lead")}</p>
        <CompleteRegistrationForm token={token} />
      </div>
    </AuthSplit>
  );
}
