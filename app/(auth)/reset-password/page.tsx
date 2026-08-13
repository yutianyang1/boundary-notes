import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { digestActionToken } from "@/lib/auth/action-tokens";
import { db } from "@/lib/db";
import { userActionTokens } from "@/lib/db/schema";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "重置密码", robots: { index: false, follow: false } };

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <Suspense fallback={<AuthSplitSkeleton />}><ResetPasswordContent searchParams={searchParams} /></Suspense>;
}

async function ResetPasswordContent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await connection();
  const { token = "" } = await searchParams;
  const tokenIsWellFormed = token.length >= 20 && token.length <= 512;
  const validToken = tokenIsWellFormed
    ? await db
        .select({ id: userActionTokens.id })
        .from(userActionTokens)
        .where(and(
          eq(userActionTokens.tokenDigest, digestActionToken(token)),
          eq(userActionTokens.type, "reset_password"),
          isNull(userActionTokens.consumedAt),
          gt(userActionTokens.expiresAt, new Date()),
        ))
        .limit(1)
    : [];

  if (!validToken.length) {
    return (
      <AuthSplit
        panelEyebrow="账户恢复"
        panelTitle={<>这条重置链接已经<span className="text-primary">失效</span></>}
        panelDescription="重置链接可能已过期、已经使用，或地址不完整。你可以重新申请一封密码重置邮件。"
        points={["重置链接只能使用一次", "新链接会让旧链接立即失效"]}
      >
        <div>
          <p className="eyebrow text-primary">账户恢复</p>
          <h1 className="headline-sm mt-4 text-3xl">链接无效或已过期</h1>
          <p className="mt-3 leading-7 text-muted-foreground">请重新申请密码重置邮件，再从最新邮件中的链接进入。</p>
          <Link href="/forgot-password" className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90">
            重新申请重置链接
          </Link>
          <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-semibold text-primary hover:underline">返回登录</Link>
          </p>
        </div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit
      panelEyebrow="账户恢复"
      panelTitle={<>设置一把新的、足够<span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">可靠</span>的钥匙。</>}
      panelDescription="完成后，账户在其他设备上的会话会全部退出，你需要使用新密码重新登录。"
      points={["新密码至少 8 个字符", "重置链接只能使用一次"]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">账户恢复</p>
        <h1 className="headline-sm mt-4 text-3xl">重置密码</h1>
        <p className="mt-3 leading-7 text-muted-foreground">输入并确认你的新密码。</p>
        <ResetPasswordForm token={token} />
        <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">返回登录</Link>
        </p>
      </div>
    </AuthSplit>
  );
}
