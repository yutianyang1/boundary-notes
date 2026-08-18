import { createTranslator } from "next-intl";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";

/** 列表卡片封面上的「已读」角标。已读与否由调用方查好再传进来。 */
export function PostReadBadge({ locale }: { locale: Locale }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "series" });
  return (
    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/65 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
      <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5 6.5 12 13 4.5" />
      </svg>
      {t("readBadge")}
    </span>
  );
}
