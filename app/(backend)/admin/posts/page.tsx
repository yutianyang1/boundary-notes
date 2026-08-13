import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { posts, postViewCounts, users } from "@/lib/db/schema";
import { deletePostAction } from "./actions";

const statusLabels = { draft: "草稿", in_review: "待审核", scheduled: "定时", published: "已发布", archived: "已归档" } as const;

export default async function AdminPostsPage() {
  await connection();
  const user = await requireStaff();
  const ownership = user.role === "author" ? eq(posts.authorId, user.id) : undefined;
  const list = await db.select({
    id: posts.id,
    title: posts.title,
    slug: posts.slug,
    status: posts.status,
    pinned: posts.pinned,
    revision: posts.revision,
    updatedAt: posts.updatedAt,
    authorName: users.name,
    viewCount: sql<number>`coalesce(${postViewCounts.viewCount}, 0)`.mapWith(Number),
  }).from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .leftJoin(postViewCounts, eq(posts.id, postViewCounts.postId))
    .where(and(isNull(posts.deletedAt), ownership))
    .orderBy(desc(posts.updatedAt));

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">共 {list.length} 篇</p>
          <h1 className="mt-1 text-3xl font-semibold">文章管理</h1>
        </div>
        <Link href="/admin/posts/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">新建文章</Link>
      </div>
      <div className="mt-8 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">文章</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">作者</th><th className="px-4 py-3 font-medium">浏览量</th><th className="px-4 py-3 font-medium">版本</th><th className="px-4 py-3 font-medium">操作</th></tr></thead>
          <tbody className="divide-y">
            {list.map((post) => (
              <tr key={post.id}>
                <td className="px-4 py-4"><div className="flex items-center gap-2"><Link href={`/admin/posts/${post.id}`} className="font-medium hover:text-primary">{post.title}</Link>{post.pinned ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">置顶</span> : null}</div><p className="mt-1 font-mono text-xs text-muted-foreground">/{post.slug}</p></td>
                <td className="px-4 py-4 text-muted-foreground">{statusLabels[post.status]}</td>
                <td className="px-4 py-4 text-muted-foreground">{post.authorName}</td>
                <td className="px-4 py-4 tabular-nums text-muted-foreground">{post.viewCount.toLocaleString("zh-CN")}</td>
                <td className="px-4 py-4 text-muted-foreground">v{post.revision}</td>
                <td className="px-4 py-4"><div className="flex items-center gap-3"><Link href={`/admin/posts/${post.id}`} className="text-primary hover:underline">编辑</Link><form action={deletePostAction}><input type="hidden" name="id" value={post.id} /><button className="text-muted-foreground hover:text-red-600">删除</button></form></div></td>
              </tr>
            ))}
            {list.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">还没有文章，先创建第一篇。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
