"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, LayoutDashboard, LogOut, SquarePen, UserRound } from "lucide-react";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { localePath } from "@/i18n/href";
import type { Locale } from "@/i18n/routing";
import type { UserRole } from "@/lib/auth/roles";

const roleMessageKeys = {
  reader: "roles.reader",
  author: "roles.author",
  editor: "roles.editor",
  admin: "roles.admin",
} as const satisfies Record<UserRole, string>;

export function UserMenu({ locale, session }: { locale: Locale; session: Session | null }) {
  const t = useTranslations("userMenu");
  const [isOpen, setIsOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!session?.user) {
    return (
      <Link
        href={localePath("/login", locale)}
        className="inline-flex h-9 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:w-28"
      >
        {t("signIn")}
      </Link>
    );
  }

  const user = session.user;
  const displayName = user.name?.trim() || t("userFallback");
  const initial = displayName.slice(0, 1).toUpperCase();
  const role = user.role as UserRole;

  return (
    <div
      ref={menuRootRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="site-user-menu"
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-9 w-16 items-center justify-center gap-1 rounded-full border bg-card px-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:w-28 sm:justify-start"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={29}
            height={29}
            unoptimized
            className="size-[1.8125rem] shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-[1.8125rem] shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,var(--primary),var(--warm))] text-xs font-extrabold text-white"
          >
            {initial}
          </span>
        )}
        <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-semibold sm:block">
          {displayName}
        </span>
        <ChevronDown
          aria-hidden
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div
          id="site-user-menu"
          role="menu"
          aria-label={t("menu")}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 origin-top-right overflow-hidden rounded-[var(--radius-card)] border bg-card [animation:overlay-in_140ms_ease-out] [box-shadow:var(--shadow)] motion-reduce:animate-none"
        >
          <div className="border-b border-hairline px-4 py-3.5">
            <p className="truncate font-bold">{displayName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {user.email ? (
                <span className="min-w-0 truncate text-xs text-muted-foreground">{user.email}</span>
              ) : null}
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] font-bold text-accent-foreground">
                {t(roleMessageKeys[role])}
              </span>
            </div>
          </div>

          <div className="p-1.5">
            <MenuLink href={localePath("/account", locale)} onNavigate={() => setIsOpen(false)}>
              <UserRound aria-hidden className="size-4 text-muted-foreground" />
              {t("account")}
            </MenuLink>
            {role !== "reader" ? (
              <>
                <MenuLink href="/admin/posts/new" onNavigate={() => setIsOpen(false)}>
                  <SquarePen aria-hidden className="size-4 text-muted-foreground" />
                  {t("writePost")}
                </MenuLink>
                <MenuLink href="/admin" onNavigate={() => setIsOpen(false)}>
                  <LayoutDashboard aria-hidden className="size-4 text-muted-foreground" />
                  {t("dashboard")}
                </MenuLink>
              </>
            ) : null}
            <div role="separator" className="my-1.5 h-px bg-hairline" />
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut({ redirectTo: localePath("/", locale) })}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <LogOut aria-hidden className="size-4" />
              {t("signOut")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
}: Readonly<{
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}>) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}
