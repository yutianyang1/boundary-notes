import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PostCard, PostCardSkeleton } from "@/components/home/post-card";
import { getPublishedPostsByTag } from "@/lib/posts/queries";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const result = await getPublishedPostsByTag(decodeURIComponent(rawSlug));
  if (!result) return {};
  return {
    title: `#${result.tag.name}`,
    description: `标签“${result.tag.name}”下的文章。`,
  };
}

export default function TagPage({ params }: PageProps) {
  return (
    <Suspense fallback={<TagSkeleton />}>
      <TagContent params={params} />
    </Suspense>
  );
}

async function TagContent({ params }: PageProps) {
  await connection();
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const result = await getPublishedPostsByTag(slug);
  if (!result) notFound();

  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader eyebrow="标签" title={`#${result.tag.name}`} count={result.posts.length} />
      {result.posts.length ? (
        <div className="mt-10 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {result.posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      ) : (
        <p className="rule-anchor mt-12 pt-12 text-muted-foreground">该标签下暂无文章。</p>
      )}
    </div>
  );
}

function TagSkeleton() {
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
