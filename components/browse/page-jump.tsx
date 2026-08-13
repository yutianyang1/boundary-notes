"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";

export function PageJump({
  yearKey,
  totalPages,
  currentPage,
}: {
  yearKey: string;
  totalPages: number;
  currentPage: number;
}) {
  const t = useTranslations("archive");
  const router = useRouter();
  const [value, setValue] = useState(String(currentPage));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let page = Math.trunc(Number(value));
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setValue(String(page));
    router.push(`/posts?year=${encodeURIComponent(yearKey)}&page=${page}#year-${yearKey}`);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <label className="text-sm text-muted-foreground" htmlFor={`jump-${yearKey}`}>
        {t("jumpTo")}
      </label>
      <input
        id={`jump-${yearKey}`}
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))}
        aria-label={t("jumpToPageOf", { total: totalPages })}
        className="h-9 w-14 rounded-md border bg-card px-2 text-center text-sm tabular-nums outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30"
      />
      <span className="text-sm tabular-nums text-muted-foreground">/ {totalPages}</span>
      <button
        type="submit"
        className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("jumpSubmit")}
      </button>
    </form>
  );
}
