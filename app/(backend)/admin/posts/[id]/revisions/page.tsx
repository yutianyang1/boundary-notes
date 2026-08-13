import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { canManagePost, requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { postRevisions, posts, users } from "@/lib/db/schema";

const statusLabels = {
  draft: "草稿",
  in_review: "待审核",
  scheduled: "定时",
  published: "已发布",
  archived: "已归档",
} as const;

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function PostRevisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const [{ id }, user] = await Promise.all([params, requireStaff()]);
  const [post] = await db
    .select({
      id: posts.id,
      title: posts.title,
      authorId: posts.authorId,
      revision: posts.revision,
    })
    .from(posts)
    .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
    .limit(1);
  if (!post || !canManagePost(user, post.authorId)) notFound();

  const revisions = await db
    .select({
      id: postRevisions.id,
      revision: postRevisions.revision,
      status: postRevisions.status,
      isPublishedVersion: postRevisions.isPublishedVersion,
      createdAt: postRevisions.createdAt,
      creatorName: users.name,
    })
    .from(postRevisions)
    .innerJoin(users, eq(postRevisions.createdBy, users.id))
    .where(eq(postRevisions.postId, id))
    .orderBy(desc(postRevisions.revision))
    .limit(100);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/admin/posts/${post.id}`} className="hover:text-foreground">返回编辑</Link>
          </p>
          <h1 className="headline mt-3 text-3xl">版本历史</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{post.title}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          当前第 {post.revision} 版
        </span>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-semibold text-muted-foreground sm:grid-cols-[6rem_8rem_minmax(0,1fr)_11rem_auto]">
          <span>版本</span>
          <span className="hidden sm:block">状态</span>
          <span>保存信息</span>
          <span className="hidden sm:block">时间</span>
          <span>对比</span>
        </div>
        <div className="divide-y">
          {revisions.map((revision, index) => (
            <div
              key={revision.id}
              className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[6rem_8rem_minmax(0,1fr)_11rem_auto]"
            >
              <span className="font-semibold tabular-nums">
                v{revision.revision}
                {revision.revision === post.revision ? (
                  <span className="ml-2 text-xs font-normal text-primary">当前</span>
                ) : null}
              </span>
              <span className="hidden text-sm text-muted-foreground sm:block">
                {statusLabels[revision.status]}
              </span>
              <span className="min-w-0 text-sm text-muted-foreground">
                <span className="truncate">{revision.creatorName}</span>
                {revision.isPublishedVersion ? (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">发布版</span>
                ) : null}
              </span>
              <time className="hidden text-xs tabular-nums text-muted-foreground sm:block">
                {dateFormatter.format(revision.createdAt)}
              </time>
              {revisions[index + 1] ? (
                <Link
                  href={`/admin/posts/${post.id}/revisions/${revision.revision}/diff`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  和上一版对比
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {revision.revision === 1 ? "初始版本" : "无上一版快照"}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {revisions.length === 100 ? (
        <p className="mt-4 text-sm text-muted-foreground">这里只显示最近 100 个版本。</p>
      ) : post.revision > revisions.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          部分早期版本没有保存快照，因此无法回溯对比。
        </p>
      ) : null}
    </section>
  );
}
