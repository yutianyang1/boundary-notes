import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PostCard, PostCardSkeleton } from "@/components/home/post-card";
import { getPublishedPostsByCategory } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const result = await getPublishedPostsByCategory(decodeURIComponent(rawSlug));
  if (!result) return {};
  return {
    title: result.category.name,
    description: result.category.description || `分类“${result.category.name}”下的文章。`,
  };
}

export default function CategoryPage({ params }: PageProps) {
  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryContent params={params} />
    </Suspense>
  );
}

async function CategoryContent({ params }: PageProps) {
  await connection();
  const { slug: rawSlug } = await params;
  const result = await getPublishedPostsByCategory(decodeURIComponent(rawSlug));
  if (!result) notFound();

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow="分类"
        title={result.category.name}
        description={result.category.description}
        count={result.posts.length}
      />
      {result.posts.length ? (
        <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {result.posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      ) : (
        <p className="rule-anchor mt-12 pt-12 text-muted-foreground">该分类下暂无文章。</p>
      )}
    </div>
  );
}

function CategorySkeleton() {
  return (
    <div className="shell py-16">
      <div className="h-12 w-56 animate-pulse rounded bg-muted" />
      <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    </div>
  );
}
