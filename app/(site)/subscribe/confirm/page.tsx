import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { isSubscriptionEnabled } from "@/lib/features";
import { confirmSubscription } from "@/lib/subscribe/service";

type PageProps = { searchParams: Promise<{ token?: string }> };

export default function ConfirmSubscriptionPage({ searchParams }: PageProps) {
  return <Suspense fallback={<ResultSkeleton />}><ConfirmResult searchParams={searchParams} /></Suspense>;
}

async function ConfirmResult({ searchParams }: PageProps) {
  await connection();
  if (!isSubscriptionEnabled()) notFound();
  const { token = "" } = await searchParams;
  const confirmed = await confirmSubscription(token);

  return (
    <div className="shell py-12 sm:py-20">
      <PageHeader
        eyebrow="邮件订阅"
        title={confirmed ? "订阅已确认" : "确认链接无效或已过期"}
        description={confirmed
          ? "下一篇文章发布时，我们会把通知送到你的邮箱。"
          : "这条链接可能已使用或已超过有效期。你可以回到首页重新订阅。"}
      />
      <div className="mt-8 max-w-[52rem] rounded-[var(--radius-card)] border bg-card p-6 [box-shadow:var(--shadow)]">
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">返回首页</Link>
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return <div className="shell py-12 sm:py-20"><div className="h-44 max-w-[52rem] animate-pulse rounded-[var(--radius-card)] bg-muted" /></div>;
}
