import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { TermCard } from "@/components/browse/term-card";
import { getPublishedCategoryList } from "@/lib/posts/queries";

export const metadata: Metadata = {
  title: "分类",
  description: "按内容分类浏览文章。",
};

export default function CategoriesPage() {
  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow="内容索引"
        title="分类"
        description="从内容领域出发，浏览每个分类下的公开文章。"
      />
      <Suspense fallback={<TermGridSkeleton />}>
        <CategoryList />
      </Suspense>
    </div>
  );
}

async function CategoryList() {
  await connection();
  const categories = await getPublishedCategoryList();
  if (!categories.length) {
    return <p className="rule-anchor mt-12 pt-12 text-muted-foreground">暂无分类。</p>;
  }

  return (
    <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
      {categories.map((category) => (
        <TermCard
          key={category.slug}
          href={`/categories/${category.slug}`}
          name={category.name}
          description={category.description}
          count={category.count}
          seed={category.slug}
          label="分类"
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
