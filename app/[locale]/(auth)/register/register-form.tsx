"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

/**
 * 倒计时按钮。父级用 state.issuedAt 当 key，每次服务端响应都重新挂载，
 * 初值直接来自 props，所以不需要在 effect 里同步状态。
 */
function ResendButton({ seconds, pending }: { seconds: number; pending: boolean }) {
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
      {pending ? "正在重发…" : waiting ? `${remaining} 秒后可重新发送` : "重新发送"}
    </button>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);

  if (state.status === "sent") {
    return (
      <div className="mt-8 rounded-[var(--radius-card)] border bg-card p-6 text-center [box-shadow:var(--shadow)]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <h2 className="headline-sm mt-4 text-xl">检查你的邮箱</h2>
        {state.emailHint ? <p className="mt-2 font-medium">{state.emailHint}</p> : null}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{state.message}</p>
        {state.notice ? (
          <p role="alert" className="mt-4 rounded-md border border-hairline bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
            {state.notice}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-center gap-4 text-sm">
          <form action={action}>
            <input type="hidden" name="email" value={state.email ?? ""} />
            <input type="hidden" name="intent" value="resend" />
            <ResendButton key={state.issuedAt} seconds={state.cooldownSeconds ?? 0} pending={pending} />
          </form>
          <Link href="/login" className="font-semibold text-primary hover:underline">返回登录</Link>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          没收到？请检查垃圾邮件文件夹，或确认邮箱地址是否填写正确。
        </p>
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
      {state.message ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{state.message}</p> : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? "正在发送…" : "发送验证邮件"}
      </button>
    </form>
  );
}
