"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};
const inputClass = "mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.resetPassword");
  const tc = useTranslations("auth.common");
  const tAuth = useTranslations("auth");
  const [state, action, pending] = useActionState(resetPasswordAction, initialState);
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-semibold">
        {tc("newPassword")}
        <input name="password" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" className={inputClass} />
        <span className="mt-2 block text-xs font-normal text-muted-foreground">{t("passwordHint")}</span>
      </label>
      <label className="block text-sm font-semibold">
        {tc("confirmNewPassword")}
        <input name="confirmPassword" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" className={inputClass} />
      </label>
      {state.errorKey ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{tAuth(state.errorKey)}</p> : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
