"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { BrandSymbol, siteName } from "@/components/brand-mark";
import { Link } from "@/i18n/navigation";
import { navigation } from "@/lib/navigation";

const drawerId = "mobile-site-navigation";
const focusableSelector =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function MobileNav() {
  const t = useTranslations("nav");
  const isMounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const closeDrawer = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) closeDrawer(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    desktopQuery.addEventListener("change", handleDesktopChange);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      desktopQuery.removeEventListener("change", handleDesktopChange);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeDrawer, isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={isOpen ? t("closeMenu") : t("openMenu")}
        aria-expanded={isOpen}
        aria-controls={drawerId}
        onClick={() => setIsOpen((open) => !open)}
        className="grid size-9 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden motion-reduce:transition-none"
      >
        {isOpen ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
      </button>

      {isMounted
        ? createPortal(
            <div
              className={`fixed inset-0 z-50 lg:hidden ${
                isOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
              }`}
              aria-hidden={!isOpen}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label={t("closeMenu")}
                onClick={() => closeDrawer()}
                className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
                  isOpen ? "opacity-100" : "opacity-0"
                }`}
              />
              <aside
                ref={panelRef}
                id={drawerId}
                role="dialog"
                aria-modal="true"
                aria-label={t("primary")}
                className={`relative flex h-full w-[min(80vw,20rem)] flex-col border-r bg-background [box-shadow:var(--shadow)] transition-transform duration-200 motion-reduce:transition-none ${
                  isOpen ? "translate-x-0" : "-translate-x-full"
                }`}
              >
                <div className="flex h-16 items-center justify-between border-b px-5">
                  <div className="flex items-center gap-3" aria-label={siteName}>
                    <BrandSymbol />
                    <span className="text-base font-bold tracking-[0.02em]">{siteName}</span>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    aria-label={t("closeMenu")}
                    onClick={() => closeDrawer()}
                    className="grid size-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>

                <nav aria-label={t("mobile")} className="flex flex-col px-4 py-5">
                  {navigation.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => closeDrawer()}
                      className="rounded-lg px-3 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      {t(item.key)}
                    </Link>
                  ))}
                </nav>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
