import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, totpUri } from "@/lib/auth/mfa";
import { db } from "@/lib/db";
import { mfaCredentials } from "@/lib/db/schema";
import { MfaEnrollmentForm } from "../mfa-form";

export const metadata = { title: "绑定两步验证" };

export default function MfaEnrollmentPage() {
  return <Suspense fallback={<MfaEnrollmentSkeleton />}><MfaEnrollmentContent /></Suspense>;
}

async function MfaEnrollmentContent() {
  await connection();
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.authState === "mfa_pending") redirect("/mfa/challenge");
  if (session.authState === "full") redirect(session.user.role === "reader" ? "/account" : "/admin");

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
        <p className="eyebrow text-primary">员工账户保护</p>
        <h1 className="headline-sm mt-3 text-3xl">绑定两步验证</h1>
        <p className="mt-3 leading-7 text-muted-foreground">使用任意 TOTP 验证器扫描二维码，然后输入生成的 6 位代码。</p>
        {/* QR content is a short-lived, encrypted-at-rest TOTP secret and must never be cached. */}
        <Image unoptimized src={qr} alt="两步验证二维码" width={240} height={240} className="mx-auto mt-6 rounded-lg border bg-white p-2" />
        <details className="mt-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer">无法扫描？显示手动密钥</summary>
          <code className="mt-2 block break-all rounded-md bg-muted p-3 text-foreground">{secret}</code>
        </details>
        <MfaEnrollmentForm />
        <div className="mt-4 text-center">
          <SignOutButton redirectTo="/login" className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">取消并退出登录</SignOutButton>
        </div>
      </section>
    </main>
  );
}

function MfaEnrollmentSkeleton() {
  return <main className="shell grid min-h-[70vh] place-items-center py-12"><div className="h-[44rem] w-full max-w-lg animate-pulse rounded-[var(--radius-card)] bg-muted" /></main>;
}
