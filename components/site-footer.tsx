import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const browseLinks = [
  { href: "/posts", label: "文章" },
  { href: "/categories", label: "分类" },
  { href: "/tags", label: "标签" },
  { href: "/series", label: "系列" },
];

const siteLinks = [
  { href: "/about", label: "关于" },
  { href: "/search", label: "搜索" },
  { href: "/feed.xml", label: "RSS" },
];

export function SiteFooter() {
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
              在复杂系统中寻找清晰的边界。记录软件架构、工程实践与那些值得反复推敲的设计决定。
            </p>
          </div>

          <nav
            aria-label="页脚导航"
            className="grid gap-8 min-[420px]:grid-cols-2 min-[420px]:gap-12"
          >
            <FooterLinkGroup title="浏览" links={browseLinks} />
            <FooterLinkGroup title="站点" links={siteLinks} />
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="tabular-nums">© {copyrightYear} 边界笔记</p>
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
  links,
}: {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h2 className="eyebrow text-muted-foreground">{title}</h2>
      <ul className="mt-4 space-y-3">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="rounded-sm text-sm font-medium text-foreground/85 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
