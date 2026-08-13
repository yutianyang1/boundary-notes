import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplit } from "@/components/auth/auth-split";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "忘记密码" };

export default function ForgotPasswordPage() {
  return (
    <AuthSplit
      panelEyebrow="账号恢复"
      panelTitle={<>找回通往<span className="[background:linear-gradient(transparent_60%,color-mix(in_oklch,var(--warm)_50%,transparent)_60%)]">边界</span>的钥匙。</>}
      panelDescription="提交账号邮箱。如果账户可用，我们会发送一条仅在短时间内有效的重置链接。"
      points={["重置链接 60 分钟内有效", "提交结果不会暴露邮箱是否已注册"]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">账号恢复</p>
        <h1 className="headline-sm mt-4 text-3xl">忘记密码</h1>
        <p className="mt-3 leading-7 text-muted-foreground">输入你的登录邮箱，我们会发送密码重置链接。</p>
        <ForgotPasswordForm />
        <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
          想起密码了？
          <Link href="/login" className="ml-1 font-semibold text-primary hover:underline">返回登录</Link>
        </p>
      </div>
    </AuthSplit>
  );
}
