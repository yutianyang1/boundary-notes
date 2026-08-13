import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { getPublishedTagCloud } from "@/lib/posts/queries";

export const metadata: Metadata = {
  title: "标签",
  description: "按主题发现文章。",
};

export default function TagsPage() {
  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow="主题索引"
        title="标签"
        description="从技术主题出发，找到彼此关联的文章。"
      />
      <Suspense fallback={<div className="mt-10 h-28 animate-pulse rounded-[var(--radius-card)] bg-muted" />}>
        <TagCloud />
      </Suspense>
    </div>
  );
}

async function TagCloud() {
  await connection();
  const tags = await getPublishedTagCloud();
  if (!tags.length) return <p className="rule-anchor mt-12 pt-12 text-muted-foreground">暂无标签。</p>;

  return (
    <div className="rule-anchor mt-12 flex flex-wrap gap-3 pt-6">
      {tags.map((tag) => (
        <Link
          key={tag.slug}
          href={`/tags/${tag.slug}`}
          className="group inline-flex items-center gap-2 rounded-full border bg-card px-5 py-3 font-semibold transition-[border-color,box-shadow,color] hover:border-primary hover:text-primary hover:[box-shadow:var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>#{tag.name}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-primary">
            {tag.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
