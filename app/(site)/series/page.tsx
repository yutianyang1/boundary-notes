import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { TermCard } from "@/components/browse/term-card";
import { getPublishedSeriesList } from "@/lib/posts/queries";

export const metadata: Metadata = {
  title: "系列",
  description: "按阅读顺序浏览主题系列。",
};

export default function SeriesPage() {
  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow="连续阅读"
        title="系列"
        description="将同一主题下的文章按顺序串联起来，从第一篇完整读到最后一篇。"
      />
      <Suspense fallback={<TermGridSkeleton />}>
        <SeriesList />
      </Suspense>
    </div>
  );
}

async function SeriesList() {
  await connection();
  const items = await getPublishedSeriesList();
  if (!items.length) {
    return <p className="rule-anchor mt-12 pt-12 text-muted-foreground">暂无系列。</p>;
  }

  return (
    <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
      {items.map((item) => (
        <TermCard
          key={item.slug}
          href={`/series/${item.slug}`}
          name={item.name}
          description={item.description}
          count={item.count}
          cover={item.cover}
          seed={item.slug}
          label="系列"
        />
      ))}
    </div>
  );
}

function TermGridSkeleton() {
  return (
    <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="overflow-hidden rounded-[var(--radius-card)] border bg-card">
          <div className="aspect-video animate-pulse bg-muted" />
          <div className="space-y-4 p-5">
            <div className="h-7 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
