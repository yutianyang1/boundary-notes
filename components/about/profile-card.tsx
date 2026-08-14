import { createTranslator } from "next-intl";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { BriefcaseBusiness, FileText, Github, Mail, MapPin, Rss } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { GeneratedCover } from "@/components/home/generated-cover";

export function ProfileCard({
  locale,
  name,
  image,
  postCount,
  email,
  githubUrl,
}: {
  locale: Locale;
  name: string;
  image?: string | null;
  postCount: number;
  email?: string;
  githubUrl?: string;
}) {
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "about" });
  const tc = createTranslator({ locale, messages, namespace: "common" });
  return (
    <aside className="overflow-hidden rounded-[var(--radius-card)] border bg-card [box-shadow:var(--shadow)]">
      <div className="relative h-24">
        <GeneratedCover
          title={name}
          seed="about-profile"
          patternOnly
          className="absolute inset-0"
        />
        <div className="absolute -bottom-7 left-5 grid size-16 place-items-center overflow-hidden rounded-full border-[3px] border-card bg-[conic-gradient(from_200deg,var(--primary),var(--warm))] text-xl font-extrabold text-white">
          {image ? (
            <Image
              src={image}
              alt={name}
              width={64}
              height={64}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </div>
      </div>

      <div className="px-5 pb-5 pt-10">
        <h2 className="headline-sm text-lg">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("profileTagline")}</p>

        <dl className="mt-5 space-y-3 border-t border-hairline pt-5 text-sm">
          <Fact icon={MapPin} label={t("location")} value={t("locationValue")} />
          <Fact icon={BriefcaseBusiness} label={t("working")} value={t("workingValue")} />
          <Fact icon={FileText} label={t("published")} value={tc("postCount", { count: postCount })} />
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {email ? (
            <ProfileLink href={`mailto:${email}`} icon={Mail} label={t("email")} />
          ) : null}
          {githubUrl ? (
            <ProfileLink href={githubUrl} icon={Github} label="GitHub" external />
          ) : null}
          <ProfileLink href="/feed.xml" icon={Rss} label="RSS" />
        </div>
      </div>
    </aside>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1rem_auto_1fr] items-start gap-2">
      <Icon aria-hidden className="mt-0.5 size-4 text-primary" />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function ProfileLink({
  href,
  icon: Icon,
  label,
  external = false,
}: {
  href: string;
  icon: typeof Mail;
  label: string;
  external?: boolean;
}) {
  const className =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const content = (
    <>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
