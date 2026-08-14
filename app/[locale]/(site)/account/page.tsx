import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import { htmlLang, type Locale } from "@/i18n/routing";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  AvatarForm,
  PasswordForm,
  ProfileForm,
  RevokeDeviceForm,
  RevokeOthersForm,
} from "./account-forms";
import { listActiveUserSessions } from "@/lib/auth/session-registry";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "account" });
  return { title: t("metaTitle") };
}

/** 日期格式跟随界面语言，时区固定东八区。 */
function dateFormatterFor(locale: Locale) {
  return new Intl.DateTimeFormat(htmlLang[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  });
}

type PageProps = { params: Promise<{ locale: string }> };

export default function AccountPage(props: PageProps) {
  return <Suspense fallback={<AccountSkeleton />}><AccountContent {...props} /></Suspense>;
}

async function AccountContent({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "account" });
  const dateFormatter = dateFormatterFor(locale);
  await connection();
  const session = await auth();
  if (!session?.user || !session.sessionId) redirect(localePath("/login", locale));
  if (session.authState !== "full") {
    redirect(localePath(session.authState === "mfa_pending" ? "/mfa/challenge?callbackUrl=/account" : "/mfa/enroll", locale));
  }
  const [[profile], sessions] = await Promise.all([
    db
      .select({ name: users.name, email: users.email, image: users.image })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
    listActiveUserSessions(session.user.id),
  ]);
  if (!profile) throw new Error("ACCOUNT_NOT_FOUND");

  const otherSessionCount = sessions.filter((item) => item.jti !== session.sessionId).length;

  return (
    <div className="shell py-8 sm:py-12">
      <header className="mx-auto max-w-[72rem] border-b pb-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            {profile.image ? (
              <Image
                src={profile.image}
                alt={profile.name}
                width={56}
                height={56}
                unoptimized
                className="size-14 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,var(--primary),var(--warm))] text-xl font-extrabold text-white">
                {profile.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="eyebrow text-primary">{t("eyebrow")}</p>
              <h1 className="headline mt-1 truncate text-3xl sm:text-4xl">{profile.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{profile.email}</span>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                  {t(`roles.${session.user.role}`)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            {session.user.role !== "reader" ? (
              <Link href="/admin" className="rounded-md border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t("backToAdmin")}
              </Link>
            ) : (
              <Link href={localePath("/", locale)} className="rounded-md border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t("backHome")}
              </Link>
            )}
            <SignOutButton className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">
              {t("signOut")}
            </SignOutButton>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-8 grid max-w-[72rem] gap-6 min-[780px]:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
          <h2 className="headline-sm text-xl">{t("profile")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("profileHint")}</p>
          <div className="mt-6 space-y-8">
            <AvatarForm image={profile.image} name={profile.name} />
            <div className="border-t pt-6">
              <ProfileForm name={profile.name} />
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
          <h2 className="headline-sm text-xl">{t("changePassword")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("passwordSectionHint")}
          </p>
          <div className="mt-6">
            <PasswordForm />
          </div>
        </section>
      </div>

      <section className="mx-auto mt-6 max-w-[72rem] overflow-hidden rounded-[var(--radius-card)] border bg-card [box-shadow:var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-6">
          <div>
            <h2 className="headline-sm text-xl">{t("devices")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("devicesHint", { count: sessions.length })}
            </p>
          </div>
          <RevokeOthersForm disabled={otherSessionCount === 0} />
        </div>

        <div className="divide-y">
          {sessions.map((item) => {
            const isCurrent = item.jti === session.sessionId;
            return (
              <article key={item.jti} className="grid gap-4 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{item.deviceName ?? t("unknownDevice")}</h3>
                    {isCurrent ? (
                      <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-semibold text-ok">
                        {t("currentDevice")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                    {t("lastSeen", { time: dateFormatter.format(item.lastSeenAt) })}
                    {item.ip ? ` · IP ${item.ip}` : ""}
                  </p>
                  <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground" title={item.userAgent ?? undefined}>
                    {t("signedInAt", { time: dateFormatter.format(item.createdAt) })}
                    {item.expiresAt ? t("expiresAt", { time: dateFormatter.format(item.expiresAt) }) : ""}
                  </p>
                </div>
                {isCurrent ? null : <RevokeDeviceForm sessionId={item.jti} />}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="shell py-12">
      <div className="mx-auto h-20 max-w-[72rem] animate-pulse rounded-[var(--radius-card)] bg-muted" />
      <div className="mx-auto mt-8 grid max-w-[72rem] gap-6 min-[780px]:grid-cols-2">
        <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-muted" />
        <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-muted" />
      </div>
    </div>
  );
}
