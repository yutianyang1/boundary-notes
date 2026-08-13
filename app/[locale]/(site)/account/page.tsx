import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
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
import { roleLabels } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata = { title: "账户中心" };

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default function AccountPage() {
  return <Suspense fallback={<AccountSkeleton />}><AccountContent /></Suspense>;
}

async function AccountContent() {
  await connection();
  const session = await auth();
  if (!session?.user || !session.sessionId) redirect("/login");
  if (session.authState !== "full") {
    redirect(session.authState === "mfa_pending" ? "/mfa/challenge?callbackUrl=/account" : "/mfa/enroll");
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
              <p className="eyebrow text-primary">账户中心</p>
              <h1 className="headline mt-1 truncate text-3xl sm:text-4xl">{profile.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{profile.email}</span>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                  {roleLabels[session.user.role]}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            {session.user.role !== "reader" ? (
              <Link href="/admin" className="rounded-md border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                返回后台
              </Link>
            ) : (
              <Link href="/" className="rounded-md border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                返回首页
              </Link>
            )}
            <SignOutButton className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">
              退出登录
            </SignOutButton>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-8 grid max-w-[72rem] gap-6 min-[780px]:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
          <h2 className="headline-sm text-xl">个人资料</h2>
          <p className="mt-2 text-sm text-muted-foreground">更新站内显示名称和头像。</p>
          <div className="mt-6 space-y-8">
            <AvatarForm image={profile.image} name={profile.name} />
            <div className="border-t pt-6">
              <ProfileForm name={profile.name} />
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
          <h2 className="headline-sm text-xl">修改密码</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            修改成功后保留当前设备，并自动退出其他登录设备。
          </p>
          <div className="mt-6">
            <PasswordForm />
          </div>
        </section>
      </div>

      <section className="mx-auto mt-6 max-w-[72rem] overflow-hidden rounded-[var(--radius-card)] border bg-card [box-shadow:var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-6">
          <div>
            <h2 className="headline-sm text-xl">登录设备</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              当前共有 {sessions.length} 个有效会话。最近活动时间最多延迟约 5 分钟。
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
                    <h3 className="font-semibold">{item.deviceName ?? "未知设备"}</h3>
                    {isCurrent ? (
                      <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-semibold text-ok">
                        当前设备
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                    最近活动：{dateFormatter.format(item.lastSeenAt)}
                    {item.ip ? ` · IP ${item.ip}` : ""}
                  </p>
                  <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground" title={item.userAgent ?? undefined}>
                    登录于 {dateFormatter.format(item.createdAt)}
                    {item.expiresAt ? ` · ${dateFormatter.format(item.expiresAt)} 到期` : ""}
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
