import type { Metadata } from "next";
import { Github, Mail, Mic2, Network, Rss, Wrench } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { localeAlternates } from "@/i18n/alternates";
import { displayName } from "@/lib/i18n/display-name";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { ProfileCard } from "@/components/about/profile-card";
import { getPrimaryPublishedAuthor, getPublishedPosts } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "about" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates("/about", locale as Locale),
  };
}

const focusAreas = [
  { href: "/categories/speech-recognition", key: "focus1", icon: Mic2 },
  { href: "/tags/system-architecture", key: "focus2", icon: Network },
  { href: "/categories/inference-optimization", key: "focus3", icon: Wrench },
] as const;

const currentWork = ["work1", "work2"] as const;

export default async function AboutPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "about" });
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL?.trim();

  return (
    <div className="shell pb-16 sm:pb-24">
      <section className="grid items-start gap-10 pt-12 min-[940px]:grid-cols-[minmax(0,1fr)_20rem] min-[940px]:gap-16 sm:pt-16">
        <div className="min-w-0 max-w-[40em]">
          <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">
            {t("eyebrow")}
          </p>
          <h1 className="headline mt-5 text-[clamp(2.4rem,5vw,3.6rem)]">
            {t.rich("headline", {
              br: () => <br />,
              hl: (chunks) => (
                <span className="[background:linear-gradient(transparent_62%,color-mix(in_oklch,var(--warm)_45%,transparent)_62%)]">{chunks}</span>
              ),
            })}
          </h1>
          <p className="mt-6 text-lg leading-[1.8] text-muted-foreground">
            {t("intro")}
          </p>
          <div className="article-body mt-8 space-y-4">
            <p>
              {t("body1")}
              <strong>{t("body1Strong")}</strong>
            </p>
            <p>
              {t("body2")}
            </p>
          </div>
        </div>

        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileData locale={locale} email={email} githubUrl={githubUrl} />
        </Suspense>
      </section>

      <AboutSection title={t("writingAbout")} note={t("writingNote")}>
        <div className="grid gap-5 min-[720px]:grid-cols-3">
          {focusAreas.map(({ href, key, icon: Icon }) => (
            <Link
              key={key}
              href={localePath(href, locale)}
              className="home-card group rounded-[var(--radius-card)] border bg-card p-6 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="grid size-10 place-items-center rounded-[0.625rem] bg-accent text-primary">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="headline-sm mt-4 text-lg group-hover:text-primary">{t(`${key}Title`)}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{t(`${key}Description`)}</p>
            </Link>
          ))}
        </div>
      </AboutSection>

      <AboutSection title={t("nowTitle")} note="Now">
        <div className="grid gap-4 min-[720px]:grid-cols-2">
          {currentWork.map((key) => (
            <div
              key={key}
              className="grid grid-cols-[auto_1fr] items-start gap-4 rounded-[var(--radius-card)] border bg-card px-6 py-5"
            >
              <span
                aria-hidden
                className="mt-2 size-3 rounded-full bg-warm [box-shadow:0_0_0_4px_color-mix(in_oklch,var(--warm)_22%,transparent)]"
              />
              <div>
                <h3 className="font-bold">{t(`${key}Title`)}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{t(`${key}Description`)}</p>
              </div>
            </div>
          ))}
        </div>
      </AboutSection>

      <AboutSection title={t("picks")} note={t("picksNote")}>
        <Suspense fallback={<PicksSkeleton />}>
          <FeaturedPostList locale={locale} />
        </Suspense>
      </AboutSection>

      <AboutSection title={t("contact")} note={t("contactNote")}>
        <div className="flex flex-wrap gap-3">
          {email ? (
            <ContactLink href={`mailto:${email}`} icon={Mail} label={t("email")} />
          ) : null}
          {githubUrl ? (
            <ContactLink href={githubUrl} icon={Github} label="GitHub" external />
          ) : null}
          <ContactLink href="/feed.xml" icon={Rss} label={t("rss")} />
        </div>
      </AboutSection>
    </div>
  );
}

async function ProfileData({
  locale,
  email,
  githubUrl,
}: {
  locale: Locale;
  email?: string;
  githubUrl?: string;
}) {
  await connection();
  const profile = await getPrimaryPublishedAuthor();
  return (
    <ProfileCard
      locale={locale}
      name="yty"
      image={profile?.image}
      postCount={profile?.postCount ?? 0}
      email={email}
      githubUrl={githubUrl}
    />
  );
}

async function FeaturedPostList({ locale }: { locale: Locale }) {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "about" });
  await connection();
  const posts = await getPublishedPosts(4);
  if (!posts.length) {
    return <p className="text-muted-foreground">{t("picksEmpty")}</p>;
  }

  return (
    <div>
      {posts.map((post) => (
        <Link
          key={post.id}
          href={localePath(`/posts/${post.slug}`, locale)}
          className="group grid gap-2 border-b border-hairline py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
        >
          <span className="text-base font-semibold group-hover:text-primary sm:text-lg">
            {post.title}
          </span>
          <span className="text-xs font-semibold text-primary">
            {displayName({ name: post.categoryName ?? "", nameEn: post.categoryNameEn }, locale)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border bg-card">
      <div className="h-24 animate-pulse bg-muted" />
      <div className="space-y-4 px-5 pb-5 pt-10">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function PicksSkeleton() {
  return (
    <div className="space-y-1">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex justify-between border-b border-hairline py-4">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function AboutSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16">
      <div className="rule-anchor flex items-baseline gap-3 pt-4">
        <h2 className="headline-sm text-xl">{title}</h2>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ContactLink({
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
    "inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const content = (
    <>
      <Icon aria-hidden className="size-4" />
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
