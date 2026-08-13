"use client";

import { useActionState } from "react";
import {
  completeRegistrationAction,
  type CompleteRegistrationState,
} from "../actions";

const initialState: CompleteRegistrationState = {};

export function CompleteRegistrationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completeRegistrationAction, initialState);
  const inputClass = "mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30";
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-semibold">
        昵称
        <input name="name" required maxLength={120} autoComplete="nickname" autoFocus className={inputClass} />
      </label>
      <label className="block text-sm font-semibold">
        密码
        <input name="password" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" className={inputClass} />
        <span className="mt-2 block text-xs font-normal text-muted-foreground">至少 8 个字符，并避开常见密码和邮箱中的信息。</span>
      </label>
      <label className="block text-sm font-semibold">
        确认密码
        <input name="confirmPassword" type="password" required minLength={8} maxLength={1024} autoComplete="new-password" className={inputClass} />
      </label>
      {state.error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{state.error}</p> : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? "正在创建…" : "创建账户"}
      </button>
    </form>
  );
}
