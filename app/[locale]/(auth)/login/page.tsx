import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { safeLocalRedirect } from "@/lib/auth/redirect";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { LoginForm } from "./login-form";
import { GitHubLoginButton } from "./github-login-button";

type LoginQuery = { error?: string; callbackUrl?: string; reset?: string; registered?: string; verified?: string };
type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<LoginQuery> };

/** Auth.js 回调里透出的错误码到字典 key 的映射。 */
const OAUTH_ERROR_KEYS = {
  STAFF_FORBIDDEN: "githubStaffForbidden",
  EMAIL_UNVERIFIED: "githubEmailUnverified",
  ACCOUNT_DISABLED: "githubAccountDisabled",
  ACCOUNT_CONFLICT: "githubAccountConflict",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.login" });
  return { title: t("metaTitle") };
}

export default function LoginPage(props: PageProps) {
  return <Suspense fallback={<AuthSplitSkeleton />}><LoginContent {...props} /></Suspense>;
}

async function LoginContent({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "auth.login" });
  const tError = createTranslator({ locale, messages: messagesFor(locale), namespace: "auth.errors" });

  const session = await auth();
  if (session?.user) {
    if (session.authState === "mfa_pending") redirect(localePath("/mfa/challenge", locale));
    if (session.authState === "mfa_enrollment_required") redirect(localePath("/mfa/enroll", locale));
    redirect(localePath(session.user.role === "reader" ? "/account" : "/admin", locale));
  }
  const registrationEnabled = isPublicRegistrationEnabled();
  const githubEnabled = Boolean(process.env.AUTH_GITHUB_ID?.trim() && process.env.AUTH_GITHUB_SECRET?.trim());
  const query = await searchParams;
  const oauthErrorKey = query.error
    ? OAUTH_ERROR_KEYS[query.error as keyof typeof OAUTH_ERROR_KEYS] ?? "githubFailed"
    : null;
  const oauthError = oauthErrorKey ? tError(oauthErrorKey) : null;
  const redirectTo = query.callbackUrl ? safeLocalRedirect(query.callbackUrl) : undefined;

  return (
    <AuthSplit
      panelEyebrow={t("eyebrow")}
      panelTitle={t.rich("panelTitle", {
        hl: (chunks) => (
          <span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">{chunks}</span>
        ),
      })}
      panelDescription={t("panelDescription")}
      points={[t("point1"), t("point2")]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">
          {t("eyebrow")}
        </p>
        <h1 className="headline-sm mt-4 text-3xl">{t("title")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("lead")}</p>
        {oauthError ? (
          <p role="alert" className="mt-6 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {oauthError}
          </p>
        ) : null}
        {query.reset === "success" ? <Notice>{t("resetComplete")}</Notice> : null}
        {query.registered === "success" ? <Notice>{t("registrationComplete")}</Notice> : null}
        {query.verified === "success" ? <Notice>{t("verificationComplete")}</Notice> : null}
        {githubEnabled ? (
          <div className="mt-7">
            <GitHubLoginButton locale={locale} redirectTo={redirectTo ?? "/account"} />
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
              {t("or")}
            </div>
          </div>
        ) : null}
        <LoginForm locale={locale} compactTop={githubEnabled} redirectTo={redirectTo} />
        {registrationEnabled ? (
          <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
            {t("noAccount")}
            <Link href={localePath("/register", locale)} className="ml-1 font-semibold text-primary hover:underline">
              {t("registerLink")}
            </Link>
          </p>
        ) : null}
      </div>
    </AuthSplit>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm text-ok">
      {children}
    </p>
  );
}

