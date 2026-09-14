"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localePath } from "@/i18n/href";
import type { Locale } from "@/i18n/routing";

/** 走到死胡同的人最需要出口，所以除了回首页，把几个主要入口一并列出来。 */
const EXITS = ["posts", "categories", "tags", "series", "search"] as const;

/**
 * 404 的正文，客户端组件。
 *
 * not-found.tsx 拿不到路由参数，但它渲染在 app/[locale]/layout.tsx 内部，
 * 那里的 NextIntlClientProvider 已经带着 locale 和字典——从 Provider 取即可。
 *
 * 服务端的两条路都走不通，均已实测：getTranslations() 和 headers() 在
 * not-found 里都会让响应变成 500，而 proxy 写的 x-locale 是响应头，
 * 服务端的 headers() 读的是请求头，本来也拿不到。
 *
 * 抽成共享组件是因为有两个 not-found 边界要用它：`(site)` 下那个带顶栏页脚，
 * 是绝大多数 404 会走到的；`[locale]` 根下那个只在 locale 非法时兜底，那时
 * 站点外壳本身都还没确定。两处渲染同一份内容，不留第二份拷贝。
 */
export function NotFoundContent() {
  const t = useTranslations("notFound");
  const tNav = useTranslations("nav");
  const locale = useLocale() as Locale;

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
          href={localePath("/", locale)}
          className="mt-8 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("backHome")}
        </Link>

        <nav aria-label={tNav("primary")} className="mt-10 flex flex-wrap gap-2 border-t border-hairline pt-6">
          {EXITS.map((key) => (
            <Link
              key={key}
              href={localePath(`/${key}`, locale)}
              className="rounded-full border bg-card px-4 py-2 text-sm font-semibold transition-[border-color,color] hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tNav(key)}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
