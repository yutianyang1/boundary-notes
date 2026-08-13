import type { Metadata } from "next";
import { Search } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/browse/page-header";
import { PostCard, PostCardSkeleton } from "@/components/home/post-card";
import { searchPublishedPosts } from "@/lib/posts/queries";

export const metadata: Metadata = {
  title: "搜索",
  description: "搜索文章标题、摘要和正文。",
};

export default function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <div className="shell py-10 sm:py-16">
      <PageHeader
        eyebrow="内容发现"
        title="搜索"
        description="从标题、摘要和正文中找到你正在寻找的内容。"
      />

      <Suspense fallback={<SearchFormMarkup />}>
        <SearchForm searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<SearchSkeleton />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchForm({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = ((await searchParams).q ?? "").normalize("NFKC").trim().slice(0, 100);
  return <SearchFormMarkup query={query} />;
}

function SearchFormMarkup({ query = "" }: { query?: string }) {
  return (
    <form action="/search" className="mt-8 flex max-w-3xl gap-3">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">搜索文章</span>
        <Search aria-hidden className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          maxLength={100}
          defaultValue={query}
          placeholder="搜索标题、摘要或正文"
          className="h-12 w-full rounded-full border bg-card pl-12 pr-4 outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </label>
      <button className="h-12 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        搜索
      </button>
    </form>
  );
}

async function SearchResults({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection();
  const query = ((await searchParams).q ?? "").normalize("NFKC").trim().slice(0, 100);
  if (!query) return <p className="rule-anchor mt-12 pt-12 text-muted-foreground">输入关键词开始搜索。</p>;

  const posts = await searchPublishedPosts(query);
  return (
    <section className="rule-anchor mt-12 pt-6">
      <h2 className="text-sm text-muted-foreground">
        “{query}”找到 <span className="font-semibold tabular-nums text-foreground">{posts.length}</span> 篇文章
      </h2>
      {posts.length ? (
        <div className="mt-6 grid gap-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      ) : (
        <p className="mt-8 rounded-lg border bg-card p-6 text-muted-foreground">没有找到匹配的文章。</p>
      )}
    </section>
  );
}

function SearchSkeleton() {
  return (
    <div className="rule-anchor mt-12 grid gap-6 pt-6 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-3">
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}
