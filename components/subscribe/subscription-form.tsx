"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { subscribeAction, type SubscribeActionState } from "@/app/[locale]/(site)/subscribe/actions";

const initialState: SubscribeActionState = {};

export function SubscriptionForm({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("subscribe");
  const [state, action, pending] = useActionState(subscribeAction, initialState);

  return (
    <section className="rounded-[var(--radius-card)] border bg-card p-5 [box-shadow:var(--shadow)]">
      <p className="eyebrow text-primary">{t("eyebrow")}</p>
      <h2 className={`headline-sm mt-3 ${compact ? "text-lg" : "text-xl"}`}>{t("title")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {t("description")}
      </p>
      <form action={action} className={`mt-4 ${compact ? "space-y-3" : "flex flex-col gap-3 sm:flex-row"}`}>
        <label className="sr-only" htmlFor={compact ? "subscribe-email-compact" : "subscribe-email"}>{t("email")}</label>
        <input
          id={compact ? "subscribe-email-compact" : "subscribe-email"}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={320}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
      {state.submitted ? (
        <p role="status" className="mt-3 text-sm leading-6 text-primary">{t("uniformResponse")}</p>
      ) : null}
    </section>
  );
}
