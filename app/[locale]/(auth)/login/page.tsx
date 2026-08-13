import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { safeLocalRedirect } from "@/lib/auth/redirect";
import { LoginForm } from "./login-form";
import { GitHubLoginButton } from "./github-login-button";

export const metadata: Metadata = { title: "登录" };

type LoginQuery = { error?: string; callbackUrl?: string; reset?: string; registered?: string; verified?: string };

export default function LoginPage({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  return <Suspense fallback={<AuthSplitSkeleton />}><LoginContent searchParams={searchParams} /></Suspense>;
}

async function LoginContent({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  const session = await auth();
  if (session?.user) {
    if (session.authState === "mfa_pending") redirect("/mfa/challenge");
    if (session.authState === "mfa_enrollment_required") redirect("/mfa/enroll");
    redirect(session.user.role === "reader" ? "/account" : "/admin");
  }
  const registrationEnabled = isPublicRegistrationEnabled();
  const githubEnabled = Boolean(process.env.AUTH_GITHUB_ID?.trim() && process.env.AUTH_GITHUB_SECRET?.trim());
  const query = await searchParams;
  const oauthError = oauthErrorMessage(query.error);
  const resetComplete = query.reset === "success";
  const registrationComplete = query.registered === "success";
  const verificationComplete = query.verified === "success";
  const redirectTo = safeLocalRedirect(query.callbackUrl);

  return (
    <AuthSplit
      panelEyebrow="内容工作台"
      panelTitle={<>回到你的<span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">工作台</span>，继续未完的推敲。</>}
      panelDescription="登录后管理账户、追踪登录设备，作者与编辑可直接进入后台创作。"
      points={[
        "邮箱与密码登录，多设备会话可见可控",
        "读者进账户中心，员工进内容后台",
      ]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">
          内容工作台
        </p>
        <h1 className="headline-sm mt-4 text-3xl">登录</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          使用邮箱和密码登录，继续管理账号或创作内容。
        </p>
        {oauthError ? (
          <p role="alert" className="mt-6 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {oauthError}
          </p>
        ) : null}
        {resetComplete ? (
          <p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm text-ok">
            密码已重置，请重新登录。
          </p>
        ) : null}
        {registrationComplete ? (
          <p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm text-ok">
            账户创建成功，请使用邮箱和密码登录。
          </p>
        ) : null}
        {verificationComplete ? (
          <p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm text-ok">
            邮箱验证成功，现在可以登录。
          </p>
        ) : null}
        {githubEnabled ? (
          <div className="mt-7">
            <GitHubLoginButton redirectTo={redirectTo} />
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
              或
            </div>
          </div>
        ) : null}
        <LoginForm compactTop={githubEnabled} redirectTo={redirectTo} />
        {registrationEnabled ? (
          <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
            还没有账号？
            <Link href="/register" className="ml-1 font-semibold text-primary hover:underline">
              注册读者账号
            </Link>
          </p>
        ) : null}
      </div>
    </AuthSplit>
  );
}

function oauthErrorMessage(code?: string) {
  if (code === "STAFF_FORBIDDEN") return "员工账号不能使用 GitHub 登录，请使用密码和 MFA 登录。";
  if (code === "EMAIL_UNVERIFIED") return "GitHub 没有提供已验证的主邮箱，无法完成登录。";
  if (code === "ACCOUNT_DISABLED") return "该账号已停用，无法登录。";
  if (code === "ACCOUNT_CONFLICT") return "GitHub 账号与站内账号关联冲突，请联系管理员。";
  if (code) return "GitHub 登录失败，请稍后重试。";
  return null;
}
