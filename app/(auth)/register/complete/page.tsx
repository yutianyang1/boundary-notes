import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { digestActionToken } from "@/lib/auth/action-tokens";
import { db } from "@/lib/db";
import { pendingRegistrations } from "@/lib/db/schema";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { CompleteRegistrationForm } from "./complete-registration-form";

export const metadata = { title: "创建账户" };

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

export default function CompleteRegistrationPage(props: { searchParams: Promise<{ token?: string }> }) {
  return <Suspense fallback={<AuthSplitSkeleton />}><CompleteRegistrationContent {...props} /></Suspense>;
}

async function CompleteRegistrationContent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await connection();
  if (!isPublicRegistrationEnabled()) notFound();
  const token = (await searchParams).token;
  if (!token || token.length < 20) notFound();
  const [pending] = await db.select({ email: pendingRegistrations.email }).from(pendingRegistrations).where(and(
    eq(pendingRegistrations.tokenDigest, digestActionToken(token)),
    isNotNull(pendingRegistrations.verifiedAt),
    isNull(pendingRegistrations.consumedAt),
    gt(pendingRegistrations.expiresAt, new Date()),
  )).limit(1);
  if (!pending) notFound();

  return (
    <AuthSplit
      panelEyebrow="邮箱已验证"
      panelTitle={<>现在设置资料，完成你的<span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">读者账户</span>。</>}
      panelDescription="账户只会在这一步提交成功后创建。昵称和密码不会通过邮件传输。"
      points={["邮箱归属已经确认", "密码至少 8 个字符"]}
    >
      <div>
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-primary"><CheckCircle2 aria-hidden className="size-6" /></span>
        <p className="eyebrow mt-5 text-primary">{maskEmail(pending.email)}</p>
        <h1 className="headline-sm mt-3 text-3xl">创建账户</h1>
        <p className="mt-3 leading-7 text-muted-foreground">邮箱验证已完成，请设置站内昵称和登录密码。</p>
        <CompleteRegistrationForm token={token} />
      </div>
    </AuthSplit>
  );
}
