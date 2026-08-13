import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PostCard, PostCardSkeleton } from "@/components/home/post-card";
import { getPublishedSeries } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const result = await getPublishedSeries(decodeURIComponent(rawSlug));
  if (!result) return {};
  return {
    title: result.series.name,
    description: result.series.description || `系列“${result.series.name}”的全部文章。`,
  };
}

export default function SeriesDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<SeriesSkeleton />}>
      <SeriesContent params={params} />
    </Suspense>
  );
}

async function SeriesContent({ params }: PageProps) {
  await connection();
  const { slug: rawSlug } = await params;
  const result = await getPublishedSeries(decodeURIComponent(rawSlug));
  if (!result) notFound();

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow="系列"
        title={result.series.name}
        description={result.series.description}
        count={result.posts.length}
      />
      {result.posts.length ? (
        <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {result.posts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              sequenceLabel={`第 ${post.seriesOrder ?? index + 1} 篇`}
            />
          ))}
        </div>
      ) : (
        <p className="rule-anchor mt-12 pt-12 text-muted-foreground">该系列暂无公开文章。</p>
      )}
    </div>
  );
}

function SeriesSkeleton() {
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
