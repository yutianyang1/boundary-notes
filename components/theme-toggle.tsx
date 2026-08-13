"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect } from "react";

const themeColors = { light: "#f8fafc", dark: "#181b22" } as const;

export function ThemeToggle() {
  const t = useTranslations("nav");
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", themeColors[resolvedTheme === "dark" ? "dark" : "light"]);
    });
  }, [resolvedTheme]);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      /**
       * 刻意使用与主题无关的静态文案。服务端渲染时 resolvedTheme 必为 undefined，
       * 任何依赖它的 aria-label 都会在水合时前后不一致（hydration mismatch）。
       * 当前状态由图标在视觉上表达，图标走 CSS 的 dark: 变体，不参与水合比对。
       */
      aria-label={t("toggleTheme")}
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </button>
  );
}
