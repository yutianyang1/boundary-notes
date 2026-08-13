import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { deleteSeriesAction } from "@/app/(backend)/admin/series/actions";
import { requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { posts, series } from "@/lib/db/schema";

export default async function AdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const [, query, rows] = await Promise.all([
    requireStaff(),
    searchParams,
    db
      .select({
        id: series.id,
        name: series.name,
        slug: series.slug,
        description: series.description,
        cover: series.cover,
        updatedAt: series.updatedAt,
        count: sql<number>`count(${posts.id})`.mapWith(Number),
      })
      .from(series)
      .leftJoin(posts, and(eq(series.id, posts.seriesId), isNull(posts.deletedAt)))
      .where(isNull(series.deletedAt))
      .groupBy(series.id)
      .orderBy(desc(series.updatedAt)),
  ]);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">内容组织</p>
          <h1 className="headline mt-3 text-3xl">系列管理</h1>
          <p className="mt-3 text-muted-foreground">维护系列元数据，并在文章编辑器中安排成员顺序。</p>
        </div>
        <Link
          href="/admin/series/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          新建系列
        </Link>
      </div>

      {query.saved || query.deleted ? (
        <p className="mt-6 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
          {query.deleted ? "系列已删除，相关文章不会再显示系列导航。" : "系列已保存。"}
        </p>
      ) : null}

      <div className="mt-8 divide-y divide-hairline border-y border-hairline">
        {rows.length ? rows.map((item) => (
          <article
            key={item.id}
            className="grid gap-4 py-6 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"
          >
            {item.cover ? (
              <Image
                src={item.cover}
                alt=""
                width={160}
                height={90}
                unoptimized
                className="aspect-video w-32 rounded-md border object-cover"
              />
            ) : (
              <div className="grid aspect-video w-32 place-items-center rounded-md border border-dashed bg-muted text-xs text-muted-foreground">
                无封面
              </div>
            )}
            <div className="min-w-0">
              <h2 className="headline-sm text-xl">{item.name}</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">/{item.slug}</p>
              {item.description ? (
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              ) : null}
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">{item.count} 篇文章</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/admin/series/${item.id}`}
                className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted"
              >
                编辑
              </Link>
              <form action={deleteSeriesAction}>
                <input type="hidden" name="id" value={item.id} />
                <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30">
                  删除
                </button>
              </form>
            </div>
          </article>
        )) : (
          <p className="py-12 text-muted-foreground">还没有系列。</p>
        )}
      </div>
    </section>
  );
}
