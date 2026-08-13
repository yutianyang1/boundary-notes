"use client";

import { Github } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function GitHubLoginButton({ redirectTo = "/account" }: { redirectTo?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signIn("github", { redirectTo });
      }}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-md border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-muted disabled:opacity-60"
    >
      <Github className="size-4" aria-hidden />
      {pending ? "正在前往 GitHub…" : "使用 GitHub 登录"}
    </button>
  );
}
