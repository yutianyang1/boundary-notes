import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { messagesFor } from "@/i18n/messages";
import { htmlLang, locales, routing } from "@/i18n/routing";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-sc";
import "../globals.css";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "边界笔记";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: `%s · ${siteName}` },
  description: "关于软件架构、工程实践与长期主义的写作。",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#181b22" },
  ],
};

/**
 * 让两个 locale 都能静态预渲染。少了这个，配合 cacheComponents 会全部退化成动态渲染。
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // 必须在 getMessages 之前调用，否则字典读取会被当成动态数据，
  // 在 cacheComponents 下让整个静态外壳阻塞。
  setRequestLocale(locale);
  const messages = messagesFor(locale);

  return (
    <html lang={htmlLang[locale]} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <NextIntlClientProvider
            locale={locale}
            messages={messages}
            timeZone="Asia/Shanghai"
          >
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
