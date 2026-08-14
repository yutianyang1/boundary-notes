"use client";

import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { registerAction, type RegisterMessageKey, type RegisterState } from "./actions";

const initialState: RegisterState = {};

/**
 * 倒计时按钮。父级用 state.issuedAt 当 key，每次服务端响应都重新挂载，
 * 初值直接来自 props，所以不需要在 effect 里同步状态。
 */
function ResendButton({ seconds, pending }: { seconds: number; pending: boolean }) {
  const t = useTranslations("auth.register");
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const id = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const waiting = remaining > 0;
  return (
    <button
      disabled={pending || waiting}
      aria-live="polite"
      className="font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
    >
      {pending ? t("resending") : waiting ? t("resendCountdown", { seconds: remaining }) : t("resend")}
    </button>
  );
}

export function RegisterForm() {
  const locale = useLocale();
  const t = useTranslations("auth.register");
  const tc = useTranslations("auth.common");
  // 服务端动作返回字典 key；locale 只随表单提交给邮件链接和跳转使用，翻译仍在这里发生。
  const tAuth = useTranslations("auth");
  const message = (key: RegisterMessageKey | undefined, values?: Record<string, number>) =>
    key ? tAuth(key, values) : null;

  const [state, action, pending] = useActionState(registerAction, initialState);

  if (state.status === "sent") {
    return (
      <div className="mt-8 rounded-[var(--radius-card)] border bg-card p-6 text-center [box-shadow:var(--shadow)]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <h2 className="headline-sm mt-4 text-xl">{t("checkInbox")}</h2>
        {state.emailHint ? <p className="mt-2 font-medium">{state.emailHint}</p> : null}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message(state.messageKey)}</p>
        {state.noticeKey ? (
          <p role="alert" className="mt-4 rounded-md border border-hairline bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
            {message(state.noticeKey, { seconds: state.cooldownSeconds ?? 0 })}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-center gap-4 text-sm">
          <form action={action}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="email" value={state.email ?? ""} />
            <input type="hidden" name="intent" value="resend" />
            <ResendButton key={state.issuedAt} seconds={state.cooldownSeconds ?? 0} pending={pending} />
          </form>
          <Link href="/login" className="font-semibold text-primary hover:underline">{tc("backToLogin")}</Link>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("notReceived")}</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="block text-sm font-semibold">
        {tc("email")}
        {/* key 让每次服务端响应后重新挂载，把回填的邮箱写进输入框，
            否则 server action 提交完会把非受控表单清空。 */}
        <input
          key={state.issuedAt}
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          defaultValue={state.email ?? ""}
          className="mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30"
        />
      </label>
      {state.messageKey ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {message(state.messageKey, { seconds: state.cooldownSeconds ?? 0 })}
        </p>
      ) : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
