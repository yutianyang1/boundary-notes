import { MailCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { verifyEmailAction } from "./actions";

export const metadata = { title: "验证邮箱" };

export default function VerifyEmailPage(props: { searchParams: Promise<{ token?: string }> }) {
  return <Suspense fallback={<AuthSplitSkeleton />}><VerifyEmailContent {...props} /></Suspense>;
}

async function VerifyEmailContent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await connection();
  if (!isPublicRegistrationEnabled()) notFound();
  const token = (await searchParams).token;
  if (!token || token.length < 20) notFound();
  return (
    <AuthSplit
      panelEyebrow="确认邮箱"
      panelTitle={<>确认邮箱后，再<span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">创建</span>你的账号。</>}
      panelDescription="为避免邮件客户端预取链接误消耗，验证需要你亲手点一下确认。"
    >
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary">
          <MailCheck aria-hidden className="size-7" />
        </span>
        <h1 className="headline-sm mt-5 text-3xl">确认邮箱归属</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          点击按钮后才会完成验证，邮件扫描器打开此页面不会消耗链接。
        </p>
        <form action={verifyEmailAction} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <button className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            验证并继续
          </button>
        </form>
      </div>
    </AuthSplit>
  );
}
