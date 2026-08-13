import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-sc";
import "../globals.css";

/**
 * 后台的根布局。后台不参与 i18n，只有站点作者使用，固定中文。
 * 它与 app/[locale]/layout.tsx 是两个并列的根布局——因此 app/ 下没有 layout.tsx。
 */
export const metadata: Metadata = {
  title: { default: "内容后台", template: "%s · 内容后台" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#181b22" },
  ],
};

export default function BackendRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
