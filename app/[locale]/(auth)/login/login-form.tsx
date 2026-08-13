"use client";

import { getSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ compactTop = false, redirectTo = "/account" }: { compactTop?: boolean; redirectTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
      redirectTo,
    });

    if (result?.error) {
      setError("邮箱或密码不正确。请检查后重试。");
      setPending(false);
      return;
    }

    const session = await getSession();
    if (session?.authState === "mfa_pending") {
      router.push(`/mfa/challenge?callbackUrl=${encodeURIComponent(redirectTo)}`);
    } else if (session?.authState === "mfa_enrollment_required") {
      router.push("/mfa/enroll");
    } else {
      router.push(redirectTo);
    }
    router.refresh();
  }

  return (
    <form className={`${compactTop ? "" : "mt-7"} space-y-5`} onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold">
        邮箱
        <input name="email" type="email" autoComplete="username" required className="mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30" />
      </label>
      <label className="block text-sm font-semibold">
        密码
        <input name="password" type="password" autoComplete="current-password" required className="mt-2 h-11 w-full rounded-md border bg-card px-3.5 font-normal outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30" />
      </label>
      <p className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          忘记密码？
        </Link>
      </p>
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button disabled={pending} className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">
        {pending ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
