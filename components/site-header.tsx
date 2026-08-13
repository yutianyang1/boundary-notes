import { Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { UserMenuServer } from "@/components/auth/user-menu-server";
import { BrandMark } from "@/components/brand-mark";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { navigation } from "@/lib/navigation";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="shell flex h-16 items-center justify-between">
        <div className="flex min-w-0 items-center gap-3 lg:gap-8">
          <MobileNav />
          <BrandMark />
          <nav aria-label="主导航" className="hidden items-center gap-5 lg:flex">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative py-1 text-sm font-medium text-muted-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform hover:text-foreground hover:after:scale-x-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <form action="/search" className="relative hidden sm:block">
            <label>
              <span className="sr-only">搜索文章</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                name="q"
                maxLength={100}
                placeholder="搜索文章…"
                className="h-9 w-52 rounded-full border bg-muted pl-9 pr-4 text-sm outline-none transition-[width,background-color,border-color] focus:w-64 focus:border-primary/60 focus:bg-card focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </form>
          <Link
            href="/search"
            aria-label="搜索"
            className="grid size-9 place-items-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
          >
            <Search className="size-4" />
          </Link>
          <ThemeToggle />
          <Suspense fallback={<span aria-hidden className="h-9 w-16 shrink-0 animate-pulse rounded-full border bg-muted motion-reduce:animate-none sm:w-28" />}>
            <UserMenuServer />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
