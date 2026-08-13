import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { RegisterForm } from "./register-form";

export const metadata = { title: "注册" };

export default function RegisterPage(props: { searchParams: Promise<{ verification?: string }> }) {
  return <Suspense fallback={<AuthSplitSkeleton />}><RegisterContent {...props} /></Suspense>;
}

async function RegisterContent({ searchParams }: { searchParams: Promise<{ verification?: string }> }) {
  await connection();
  if (!isPublicRegistrationEnabled()) notFound();
  const verificationInvalid = (await searchParams).verification === "invalid";
  return (
    <AuthSplit
      panelEyebrow="读者账号"
      panelTitle={<>加入进来，在<span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">边界</span>处留下你的痕迹。</>}
      panelDescription="先确认邮箱归属，再设置昵称和密码。验证完成前不会创建账户。"
      points={[
        "第一步只需要填写邮箱",
        "验证通过后再创建账户",
      ]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">
          读者账号
        </p>
        <h1 className="headline-sm mt-4 text-3xl">注册</h1>
        <p className="mt-3 leading-7 text-muted-foreground">输入邮箱，我们会发送一封 24 小时内有效的验证邮件。</p>
        {verificationInvalid ? (
          <p role="alert" className="mt-6 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            验证链接无效或已经过期，请重新填写邮箱获取新链接。
          </p>
        ) : null}
        <RegisterForm />
        <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
          已有账号？
          <Link href="/login" className="ml-1 font-semibold text-primary hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </AuthSplit>
  );
}
