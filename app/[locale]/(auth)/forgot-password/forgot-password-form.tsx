"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const tc = useTranslations("auth.common");
  const [state, action, pending] = useActionState(forgotPasswordAction, initialState);
  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-semibold">
        {tc("email")}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30"
        />
      </label>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2.5 text-sm ${state.status === "error" ? "border-danger/30 bg-danger/10 text-danger" : "border-ok/30 bg-ok/10 text-ok"}`}
        >
          {state.message}
        </p>
      ) : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
