"use client";

import { Github } from "lucide-react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function GitHubLoginButton({ redirectTo = "/account" }: { redirectTo?: string }) {
  const t = useTranslations("auth.login");
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
      {pending ? t("githubPending") : t("github")}
    </button>
  );
}
