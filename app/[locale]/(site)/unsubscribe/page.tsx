import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { SubscriptionForm } from "@/components/subscribe/subscription-form";
import { isSubscriptionEnabled } from "@/lib/features";
import { unsubscribe } from "@/lib/subscribe/service";

type PageProps = { searchParams: Promise<{ id?: string; token?: string }> };

export default function UnsubscribePage({ searchParams }: PageProps) {
  return <Suspense fallback={<ResultSkeleton />}><UnsubscribeResult searchParams={searchParams} /></Suspense>;
}

async function UnsubscribeResult({ searchParams }: PageProps) {
  await connection();
  if (!isSubscriptionEnabled()) notFound();
  const { id = "", token = "" } = await searchParams;
  const success = await unsubscribe(id, token);

  return (
    <div className="shell py-12 sm:py-20">
      <PageHeader
        eyebrow="邮件订阅"
        title={success ? "已经退订" : "退订链接无效"}
        description={success
          ? "之后不会再向这个邮箱发送新文章通知。"
          : "无法验证这条退订链接，请使用最近一封文章通知中的链接。"}
      />
      <div className="mt-8 max-w-[52rem]">
        {success ? <SubscriptionForm /> : (
          <div className="rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
            <Link href="/" className="text-sm font-semibold text-primary hover:underline">返回首页</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return <div className="shell py-12 sm:py-20"><div className="h-44 max-w-[52rem] animate-pulse rounded-[var(--radius-card)] bg-muted" /></div>;
}
