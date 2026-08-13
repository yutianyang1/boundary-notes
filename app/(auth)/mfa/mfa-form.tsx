"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  confirmMfaEnrollmentAction,
  type MfaActionState,
  verifyMfaChallengeAction,
} from "./actions";

const initialState: MfaActionState = {};

export function MfaChallengeForm({ redirectTo }: { redirectTo: string }) {
  const [state, action, pending] = useActionState(verifyMfaChallengeAction, initialState);
  const router = useRouter();
  useEffect(() => {
    if (state.success) {
      router.replace(redirectTo);
      router.refresh();
    }
  }, [redirectTo, router, state.success]);
  return <CodeForm action={action} pending={pending} error={state.error} label="验证器代码或恢复码" button="完成登录" />;
}

export function MfaEnrollmentForm() {
  const [state, action, pending] = useActionState(confirmMfaEnrollmentAction, initialState);
  if (state.success && state.recoveryCodes) {
    return (
      <div className="mt-7">
        <div className="rounded-lg border border-warm/40 bg-warm/10 p-5">
          <h2 className="font-semibold">请立即保存恢复码</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">每个恢复码只能使用一次。手机丢失时，它们是登录账户的备用方式。</p>
          <pre className="mt-4 grid grid-cols-2 gap-2 overflow-x-auto rounded-md bg-background p-4 text-sm"><code>{state.recoveryCodes.join("\n")}</code></pre>
        </div>
        <Link href="/admin" className="mt-6 grid h-11 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">我已保存，进入后台</Link>
      </div>
    );
  }
  return <CodeForm action={action} pending={pending} error={state.error} label="验证器中的 6 位代码" button="确认绑定" />;
}

function CodeForm({ action, pending, error, label, button }: {
  action: (payload: FormData) => void;
  pending: boolean;
  error?: string;
  label: string;
  button: string;
}) {
  return (
    <form action={action} className="mt-7 space-y-5">
      <label className="block text-sm font-semibold">
        {label}
        <input name="code" required autoComplete="one-time-code" inputMode="text" maxLength={20} autoFocus className="mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-mono tracking-[0.18em] outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />
      </label>
      {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p> : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{pending ? "正在验证…" : button}</button>
    </form>
  );
}
