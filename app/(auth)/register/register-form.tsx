"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);
  if (state.status === "success") {
    return (
      <div className="mt-8 rounded-[var(--radius-card)] border bg-card p-6 text-center [box-shadow:var(--shadow)]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <h2 className="headline-sm mt-4 text-xl">检查你的邮箱</h2>
        {state.emailHint ? <p className="mt-2 font-medium">{state.emailHint}</p> : null}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{state.message}</p>
        <div className="mt-5 flex justify-center gap-4 text-sm">
          <form action={action}>
            <input type="hidden" name="email" value={state.email ?? ""} />
            <button disabled={pending} className="font-semibold text-primary hover:underline disabled:opacity-60">{pending ? "正在重发…" : "重新发送"}</button>
          </form>
          <Link href="/login" className="font-semibold text-primary hover:underline">返回登录</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-5">
      <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="block text-sm font-semibold">
        邮箱
        <input name="email" type="email" required autoComplete="email" autoFocus className="mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30" />
      </label>
      {state.message ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{state.message}</p> : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? "正在发送…" : "发送验证邮件"}
      </button>
    </form>
  );
}
