import { createTranslator } from "next-intl";
import { BrandMark, siteName } from "@/components/brand-mark";
import Link from "next/link";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";

const browseLinks = [
  { href: "/posts", key: "posts" },
  { href: "/categories", key: "categories" },
  { href: "/tags", key: "tags" },
  { href: "/series", key: "series" },
] as const;

const siteLinks = [
  { href: "/about", key: "about" },
  { href: "/search", key: "search" },
] as const;

export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "nav" });
  const tf = createTranslator({ locale, messages, namespace: "footer" });
  const copyrightYear = process.env.NEXT_PUBLIC_COPYRIGHT_YEAR ?? "2026";
  const icpBeian = process.env.NEXT_PUBLIC_ICP_BEIAN?.trim();
  const mpsBeian = process.env.NEXT_PUBLIC_MPS_BEIAN?.trim();

  return (
    <footer className="mt-auto border-t border-border bg-muted/40">
      <div className="shell py-12 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-16">
          <div className="max-w-[28rem]">
            <BrandMark />
            <p className="mt-4 max-w-[24em] text-sm leading-[1.8] text-muted-foreground">
              {tf("tagline")}
            </p>
          </div>

          <nav
            aria-label={tf("nav")}
            className="grid gap-8 min-[420px]:grid-cols-2 min-[420px]:gap-12"
          >
            <FooterLinkGroup
              title={tf("browse")}
              locale={locale}
              links={browseLinks.map((item) => ({ href: item.href, label: t(item.key) }))}
            />
            <FooterLinkGroup
              title={tf("site")}
              locale={locale}
              links={[
                ...siteLinks.map((item) => ({ href: item.href, label: t(item.key) })),
                { href: "/feed.xml", label: "RSS", external: true },
              ]}
            />
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="tabular-nums">© {copyrightYear} {siteName}</p>
          {icpBeian || mpsBeian ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {icpBeian ? (
                <ComplianceLink href="https://beian.miit.gov.cn/">
                  {icpBeian}
                </ComplianceLink>
              ) : null}
              {mpsBeian ? (
                <ComplianceLink href="https://beian.mps.gov.cn/">
                  <PublicSecurityMark />
                  <span>{mpsBeian}</span>
                </ComplianceLink>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

function ComplianceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex w-fit items-center gap-1.5 rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </a>
  );
}

function PublicSecurityMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4 shrink-0"
      fill="none"
    >
      <path
        d="M10 1.8c2.1 1.5 4.4 2.3 6.8 2.5v4.8c0 4.1-2.4 7.3-6.8 9.1-4.4-1.8-6.8-5-6.8-9.1V4.3C5.6 4.1 7.9 3.3 10 1.8Z"
        fill="currentColor"
        opacity=".16"
      />
      <path
        d="M10 1.8c2.1 1.5 4.4 2.3 6.8 2.5v4.8c0 4.1-2.4 7.3-6.8 9.1-4.4-1.8-6.8-5-6.8-9.1V4.3C5.6 4.1 7.9 3.3 10 1.8Z"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="m10 5.2.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3.9-1.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FooterLinkGroup({
  title,
  locale,
  links,
}: {
  title: string;
  locale: Locale;
  links: ReadonlyArray<{ href: string; label: string; external?: boolean }>;
}) {
  return (
    <div>
      <h2 className="eyebrow text-muted-foreground">{title}</h2>
      <ul className="mt-4 space-y-3">
        {links.map((item) => (
          <li key={item.href}>
            {item.external ? (
              // RSS 是单一中文源，不带 locale 前缀，所以走原生 a 而非 i18n Link。
              <a
                href={item.href}
                className="rounded-sm text-sm font-medium text-foreground/85 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </a>
            ) : (
              <Link
                href={localePath(item.href, locale)}
                className="rounded-sm text-sm font-medium text-foreground/85 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
