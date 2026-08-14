import Link from "next/link";
import { createTranslator } from "next-intl";
import { messagesFor } from "@/i18n/messages";
import { defaultLocale } from "@/i18n/routing";

/**
 * 固定用默认语言。not-found.tsx 拿不到 locale：没有 params，
 * getTranslations() 和 headers() 在这里都会让响应变成 500（两种都实测过）。
 *
 * 后果：/en 下的 404 正文是中文，<html lang> 仍然正确。
 * 要修得靠 Next 的 global-not-found（目前还在 experimental 开关后面）。
 */
export default function NotFound() {
  const t = createTranslator({
    locale: defaultLocale,
    messages: messagesFor(defaultLocale),
    namespace: "notFound",
  });

  return (
    <div className="shell flex flex-1 items-center py-24">
      <div>
        <div className="flex items-center gap-3">
          <span aria-hidden className="block h-1 w-8 bg-primary" />
          <span className="eyebrow tabular-nums text-foreground/80">404</span>
        </div>

        <h1 className="headline mt-6 text-[2.25rem] sm:text-5xl">{t("title")}</h1>

        <p className="mt-8 max-w-[32em] text-lg leading-[1.8] text-muted-foreground">
          {t("description")}
        </p>

        <Link
          href="/"
          className="mt-8 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
