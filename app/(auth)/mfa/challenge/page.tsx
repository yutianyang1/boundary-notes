import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { safeLocalRedirect } from "@/lib/auth/redirect";
import { MfaChallengeForm } from "../mfa-form";

export const metadata = { title: "两步验证" };

export default function MfaChallengePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  return <Suspense fallback={<MfaPageSkeleton />}><MfaChallengeContent searchParams={searchParams} /></Suspense>;
}

async function MfaChallengeContent({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.authState === "mfa_enrollment_required") redirect("/mfa/enroll");
  if (session.authState === "full") redirect(session.user.role === "reader" ? "/account" : "/admin");
  const query = await searchParams;
  const redirectTo = query.callbackUrl
    ? safeLocalRedirect(query.callbackUrl)
    : session.user.role === "reader" ? "/account" : "/admin";
  return (
    <main className="shell grid min-h-[70vh] place-items-center py-12">
      <section className="w-full max-w-md rounded-[var(--radius-card)] border bg-card p-7 [box-shadow:var(--shadow)]">
        <p className="eyebrow text-primary">账户安全</p>
        <h1 className="headline-sm mt-3 text-3xl">完成两步验证</h1>
        <p className="mt-3 leading-7 text-muted-foreground">输入验证器生成的代码，也可以使用一个尚未用过的恢复码。</p>
        <MfaChallengeForm redirectTo={redirectTo} />
        <div className="mt-4 text-center">
          <SignOutButton redirectTo="/login" className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">取消并退出登录</SignOutButton>
        </div>
      </section>
    </main>
  );
}

function MfaPageSkeleton() {
  return <main className="shell grid min-h-[70vh] place-items-center py-12"><div className="h-96 w-full max-w-md animate-pulse rounded-[var(--radius-card)] bg-muted" /></main>;
}
