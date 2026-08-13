import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, totpUri } from "@/lib/auth/mfa";
import { db } from "@/lib/db";
import { mfaCredentials } from "@/lib/db/schema";
import { MfaEnrollmentForm } from "../mfa-form";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.mfa" });
  return { title: t("enrollMetaTitle") };
}

export default function MfaEnrollmentPage(props: PageProps) {
  return <Suspense fallback={<MfaEnrollmentSkeleton />}><MfaEnrollmentContent {...props} /></Suspense>;
}

async function MfaEnrollmentContent({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "auth.mfa" });
  await connection();
  const session = await auth();
  if (!session?.user) redirect(localePath("/login", locale));
  if (session.authState === "mfa_pending") redirect(localePath("/mfa/challenge", locale));
  if (session.authState === "full") redirect(localePath(session.user.role === "reader" ? "/account" : "/admin", locale));

  let [credential] = await db.select().from(mfaCredentials).where(eq(mfaCredentials.userId, session.user.id)).limit(1);
  if (!credential) {
    const encrypted = encryptMfaSecret(generateTotpSecret());
    await db.insert(mfaCredentials).values({ userId: session.user.id, ...encrypted }).onConflictDoNothing();
    [credential] = await db.select().from(mfaCredentials).where(eq(mfaCredentials.userId, session.user.id)).limit(1);
  }
  if (!credential) throw new Error("MFA_ENROLLMENT_UNAVAILABLE");
  const secret = decryptMfaSecret(credential.secretEnc, credential.keyVersion);
  const uri = totpUri(secret, session.user.email ?? session.user.id);
  const qr = await QRCode.toDataURL(uri, { width: 240, margin: 1, errorCorrectionLevel: "M" });

  return (
    <main className="shell grid min-h-[70vh] place-items-center py-12">
      <section className="w-full max-w-lg rounded-[var(--radius-card)] border bg-card p-7 [box-shadow:var(--shadow)]">
        <p className="eyebrow text-primary">{t("enrollEyebrow")}</p>
        <h1 className="headline-sm mt-3 text-3xl">{t("enrollTitle")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("enrollLead")}</p>
        {/* QR content is a short-lived, encrypted-at-rest TOTP secret and must never be cached. */}
        <Image unoptimized src={qr} alt={t("qrAlt")} width={240} height={240} className="mx-auto mt-6 rounded-lg border bg-white p-2" />
        <details className="mt-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer">{t("manualKey")}</summary>
          <code className="mt-2 block break-all rounded-md bg-muted p-3 text-foreground">{secret}</code>
        </details>
        <MfaEnrollmentForm />
        <div className="mt-4 text-center">
          <SignOutButton redirectTo={localePath("/login", locale)} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">{t("cancelAndSignOut")}</SignOutButton>
        </div>
      </section>
    </main>
  );
}

function MfaEnrollmentSkeleton() {
  return <main className="shell grid min-h-[70vh] place-items-center py-12"><div className="h-[44rem] w-full max-w-lg animate-pulse rounded-[var(--radius-card)] bg-muted" /></main>;
}
