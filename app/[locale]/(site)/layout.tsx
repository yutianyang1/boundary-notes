import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { Locale } from "@/i18n/routing";

/**
 * locale 从 params 显式取，再显式传给顶栏和页脚。
 * 不这样做的话 getTranslations() 会回落到读 headers()，在 cacheComponents 下
 * 就是「未缓存数据」——而且它发生在布局链上，外面包 Suspense 也救不回来。
 */
export default async function SiteLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  // Next 生成的 LayoutProps 把 params 定为 string；上层 [locale]/layout 已经
  // 用 hasLocale 校验过非法值会 notFound，这里可以安全收窄。
  const { locale } = await params as { locale: Locale };
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader locale={locale} />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter locale={locale} />
    </div>
  );
}
