"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  confirmMfaEnrollmentAction,
  type MfaActionState,
  type MfaErrorKey,
  verifyMfaChallengeAction,
} from "./actions";

const initialState: MfaActionState = {};

export function MfaChallengeForm({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations("auth.mfa");
  const [state, action, pending] = useActionState(verifyMfaChallengeAction, initialState);
  const router = useRouter();
  useEffect(() => {
    if (state.success) {
      router.replace(redirectTo);
      router.refresh();
    }
  }, [redirectTo, router, state.success]);
  return <CodeForm action={action} pending={pending} errorKey={state.errorKey} label={t("challengeCodeLabel")} button={t("submit")} />;
}

export function MfaEnrollmentForm() {
  const t = useTranslations("auth.mfa");
  const [state, action, pending] = useActionState(confirmMfaEnrollmentAction, initialState);
  if (state.success && state.recoveryCodes) {
    return (
      <div className="mt-7">
        <div className="rounded-lg border border-warm/40 bg-warm/10 p-5">
          <h2 className="font-semibold">{t("saveRecoveryCodes")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("recoveryCodesHint")}</p>
          <pre className="mt-4 grid grid-cols-2 gap-2 overflow-x-auto rounded-md bg-background p-4 text-sm"><code>{state.recoveryCodes.join("\n")}</code></pre>
        </div>
        <Link href="/admin" className="mt-6 grid h-11 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">{t("enterAdmin")}</Link>
      </div>
    );
  }
  return <CodeForm action={action} pending={pending} errorKey={state.errorKey} label={t("enrollCodeLabel")} button={t("enrollSubmit")} />;
}

function CodeForm({ action, pending, errorKey, label, button }: {
  action: (payload: FormData) => void;
  pending: boolean;
  errorKey?: MfaErrorKey;
  label: string;
  button: string;
}) {
  const t = useTranslations("auth.mfa");
  const tAuth = useTranslations("auth");
  return (
    <form action={action} className="mt-7 space-y-5">
      <label className="block text-sm font-semibold">
        {label}
        <input name="code" required autoComplete="one-time-code" inputMode="text" maxLength={20} autoFocus className="mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-mono tracking-[0.18em] outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />
      </label>
      {errorKey ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{tAuth(errorKey)}</p> : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{pending ? t("submitting") : button}</button>
    </form>
  );
}
