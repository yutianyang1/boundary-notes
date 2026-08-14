"use client";

import { Github } from "lucide-react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { localePath } from "@/i18n/href";
import type { Locale } from "@/i18n/routing";
import { useState } from "react";

export function GitHubLoginButton({ locale, redirectTo = "/account" }: { locale: Locale; redirectTo?: string }) {
  const t = useTranslations("auth.login");
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signIn("github", { redirectTo: localePath(redirectTo, locale) });
      }}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-md border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-muted disabled:opacity-60"
    >
      <Github className="size-4" aria-hidden />
      {pending ? t("githubPending") : t("github")}
    </button>
  );
}
