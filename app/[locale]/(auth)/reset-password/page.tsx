import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { authRichTags } from "@/components/auth/rich-tags";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { digestActionToken } from "@/lib/auth/action-tokens";
import { db } from "@/lib/db";
import { userActionTokens } from "@/lib/db/schema";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.resetPassword" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> };

export default function ResetPasswordPage(props: PageProps) {
  return <Suspense fallback={<AuthSplitSkeleton />}><ResetPasswordContent {...props} /></Suspense>;
}

async function ResetPasswordContent({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "auth.resetPassword" });
  const tc = createTranslator({ locale, messages, namespace: "auth.common" });
  await connection();
  const { token = "" } = await searchParams;
  const tokenIsWellFormed = token.length >= 20 && token.length <= 512;
  const validToken = tokenIsWellFormed
    ? await db
        .select({ id: userActionTokens.id })
        .from(userActionTokens)
        .where(and(
          eq(userActionTokens.tokenDigest, digestActionToken(token)),
          eq(userActionTokens.type, "reset_password"),
          isNull(userActionTokens.consumedAt),
          gt(userActionTokens.expiresAt, new Date()),
        ))
        .limit(1)
    : [];

  if (!validToken.length) {
    return (
      <AuthSplit
        panelEyebrow={t("eyebrow")}
        panelTitle={t.rich("invalidPanelTitle", authRichTags)}
        panelDescription={t("invalidPanelDescription")}
        points={[t("point2"), t("invalidPoint2")]}
      >
        <div>
          <p className="eyebrow text-primary">{t("eyebrow")}</p>
          <h1 className="headline-sm mt-4 text-3xl">{t("invalidTitle")}</h1>
          <p className="mt-3 leading-7 text-muted-foreground">{t("invalidLead")}</p>
          <Link href={localePath("/forgot-password", locale)} className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90">
            {t("requestNew")}
          </Link>
          <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
            <Link href={localePath("/login", locale)} className="font-semibold text-primary hover:underline">{tc("backToLogin")}</Link>
          </p>
        </div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit
      panelEyebrow={t("eyebrow")}
      panelTitle={t.rich("panelTitle", authRichTags)}
      panelDescription={t("panelDescription")}
      points={[t("point1"), t("point2")]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">{t("eyebrow")}</p>
        <h1 className="headline-sm mt-4 text-3xl">{t("title")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("lead")}</p>
        <ResetPasswordForm token={token} />
        <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
          <Link href={localePath("/login", locale)} className="font-semibold text-primary hover:underline">{tc("backToLogin")}</Link>
        </p>
      </div>
    </AuthSplit>
  );
}
