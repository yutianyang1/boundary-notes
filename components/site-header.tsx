import { Search } from "lucide-react";
import { createTranslator } from "next-intl";
import { Suspense } from "react";
import { UserMenuServer } from "@/components/auth/user-menu-server";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import { navigation } from "@/lib/navigation";
import type { Locale } from "@/i18n/routing";

export function SiteHeader({ locale }: { locale: Locale }) {
  // 全同步：createTranslator 是纯函数，字典是静态导入，整个顶栏不产生任何 await。
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "nav" });
  // 原生 form 的 action 不经过 next/link，要自己补上 locale 前缀。
  // 手算而非用 next-intl 的 getPathname：默认 locale 不带前缀，规则简单，
  // 而 getPathname 会触碰请求配置，在 cacheComponents 下会阻塞静态外壳。
  const searchAction = localePath("/search", locale);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="shell flex h-16 items-center justify-between">
        <div className="flex min-w-0 items-center gap-3 lg:gap-8">
          <MobileNav />
          <BrandMark />
          <nav aria-label={t("primary")} className="hidden items-center gap-5 lg:flex">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={localePath(item.href, locale)}
                className="relative py-1 text-sm font-medium text-muted-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform hover:text-foreground hover:after:scale-x-100"
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <form action={searchAction} className="relative hidden sm:block">
            <label>
              <span className="sr-only">{t("searchPosts")}</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                name="q"
                maxLength={100}
                placeholder={t("searchPlaceholder")}
                className="h-9 w-52 rounded-full border bg-muted pl-9 pr-4 text-sm outline-none transition-[width,background-color,border-color] focus:w-64 focus:border-primary/60 focus:bg-card focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </form>
          <Link
            href={localePath("/search", locale)}
            aria-label={t("search")}
            className="grid size-9 place-items-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
          >
            <Search className="size-4" />
          </Link>
          {/* 语言切换要读当前路径，那在预渲染期属于请求数据，必须单独包 Suspense。 */}
          <Suspense fallback={<span aria-hidden className="size-9 shrink-0 rounded-md border bg-muted" />}>
            <LanguageToggle />
          </Suspense>
          <ThemeToggle />
          <Suspense fallback={<span aria-hidden className="h-9 w-16 shrink-0 animate-pulse rounded-full border bg-muted motion-reduce:animate-none sm:w-28" />}>
            <UserMenuServer />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
