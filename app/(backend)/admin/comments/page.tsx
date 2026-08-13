import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireEditor } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { comments, posts, users } from "@/lib/db/schema";
import { areCommentsEnabled } from "@/lib/features";
import { deleteCommentAdminAction, markCommentSpamAction } from "./actions";

const statuses = ["approved", "pending", "spam"] as const;
type Status = (typeof statuses)[number];
const labels: Record<Status, string> = { approved: "已通过", pending: "待审核", spam: "垃圾评论" };
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" });

export default async function AdminCommentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  if (!areCommentsEnabled()) notFound();
  await requireEditor();
  const requested = (await searchParams).status;
  const status = statuses.includes(requested as Status) ? requested as Status : null;
  const [rows, counts] = await Promise.all([
    db.select({
      id: comments.id,
      content: comments.content,
      status: comments.status,
      createdAt: comments.createdAt,
      deletedAt: comments.deletedAt,
      postTitle: posts.title,
      postSlug: posts.slug,
      authorName: users.name,
      authorEmail: users.email,
      userId: comments.userId,
    }).from(comments)
      .innerJoin(posts, eq(comments.postId, posts.id))
      .leftJoin(users, eq(comments.userId, users.id))
      .where(status ? eq(comments.status, status) : undefined)
      .orderBy(desc(comments.createdAt))
      .limit(500),
    db.select({ status: comments.status, count: sql<number>`count(*)`.mapWith(Number) }).from(comments).groupBy(comments.status),
  ]);
  const countByStatus = new Map(counts.map((item) => [item.status, item.count]));
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  return (
    <section>
      <p className="eyebrow text-primary">全站讨论</p>
      <h1 className="headline mt-3 text-3xl">评论管理</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">查看评论、标记垃圾内容或软删除，删除不会截断回复链。</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        <StatLink href="/admin/comments" label="全部" value={total} active={!status} />
        {statuses.map((item) => <StatLink key={item} href={`/admin/comments?status=${item}`} label={labels[item]} value={countByStatus.get(item) ?? 0} active={status === item} />)}
      </div>
      <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground"><tr>
              <th className="px-5 py-3 font-medium">文章</th><th className="px-5 py-3 font-medium">作者</th><th className="px-5 py-3 font-medium">内容</th><th className="px-5 py-3 font-medium">时间</th><th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">操作</th>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-52 px-5 py-4"><Link href={`/posts/${row.postSlug}#comments`} className="font-medium hover:text-primary">{row.postTitle}</Link></td>
                  <td className="px-5 py-4"><span className="font-medium">{row.userId ? row.authorName ?? "读者" : "已注销用户"}</span>{row.authorEmail ? <span className="mt-1 block text-xs text-muted-foreground">{row.authorEmail}</span> : null}</td>
                  <td className="max-w-sm px-5 py-4 text-muted-foreground"><span className="line-clamp-2">{row.deletedAt ? "该评论已删除" : row.content}</span></td>
                  <td className="px-5 py-4 tabular-nums text-muted-foreground">{dateFormatter.format(row.createdAt)}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{labels[row.status]}</span></td>
                  <td className="px-5 py-4"><div className="flex gap-3">
                    {row.status !== "spam" ? <form action={markCommentSpamAction}><input type="hidden" name="id" value={row.id} /><button className="text-xs text-muted-foreground hover:text-primary">标记垃圾</button></form> : null}
                    {!row.deletedAt ? <form action={deleteCommentAdminAction}><input type="hidden" name="id" value={row.id} /><button className="text-xs text-muted-foreground hover:text-danger">删除</button></form> : null}
                  </div></td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">当前筛选下没有评论。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StatLink({ href, label, value, active }: { href: string; label: string; value: number; active: boolean }) {
  return <Link href={href} className={`rounded-lg border p-4 ${active ? "border-primary bg-accent" : "bg-card hover:border-primary/40"}`}><span className="text-sm text-muted-foreground">{label}</span><strong className="mt-1 block text-2xl tabular-nums">{value}</strong></Link>;
}
