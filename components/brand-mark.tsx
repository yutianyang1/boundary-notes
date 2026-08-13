"use client";

import { Link } from "@/i18n/navigation";

export const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "边界笔记";

// 阶梯边界标记。同一图形另存于 app/icon.svg(favicon)与 docs/brand/(位图导出)。
export function BrandSymbol() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="brand-mark-symbol">
      <rect width="32" height="32" rx="7.5" fill="var(--primary)" />
      <path
        d="M6.5 25.5 L6.5 18.5 L14 18.5 L14 11 L21.5 11 L21.5 6.5"
        stroke="var(--primary-foreground)"
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 客户端组件：locale 由 NextIntlClientProvider 提供，不需要调用方层层传，
 * 也不会像服务端那样去读请求上下文。
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group flex w-fit shrink-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      <BrandSymbol />
      <span className="text-base font-bold tracking-[0.02em]">{siteName}</span>
    </Link>
  );
}
