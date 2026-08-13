"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";

/**
 * 语言切换。usePathname 来自 i18n/navigation，返回的是去掉 locale 前缀的
 * 逻辑路径，所以切换时能停在当前页面而不是被丢回首页。
 */
export function LanguageToggle() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next = locale === "zh" ? "en" : "zh";
  const label = next === "en" ? t("switchToEnglish") : t("switchToChinese");

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      title={label}
      onClick={() => {
        startTransition(() => {
          // usePathname 返回的已经是解析后的真实路径（含 slug 实际值），
          // 直接传即可，不需要再补动态段参数。
          router.replace(pathname, { locale: next });
        });
      }}
      className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
    >
      <Languages aria-hidden className="size-4" />
      <span className="sr-only">{t("language")}</span>
    </button>
  );
}
