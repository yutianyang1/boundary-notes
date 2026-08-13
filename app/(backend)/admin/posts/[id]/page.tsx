import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PostEditorForm } from "@/components/admin/post-editor-form";
import { canManagePost, requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { posts, postTags, series, tags } from "@/lib/db/schema";

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await connection();
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireStaff()]);
  const [[post], tagRows, seriesOptions] = await Promise.all([
    db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .limit(1),
    db
      .select({ name: tags.name })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(and(eq(postTags.postId, id), isNull(tags.deletedAt)))
      .orderBy(tags.name),
    db
      .select({ id: series.id, name: series.name })
      .from(series)
      .where(isNull(series.deletedAt))
      .orderBy(series.name),
  ]);
  if (!post || !canManagePost(user, post.authorId)) notFound();

  return (
    <section>
      {/* 标题输入框本身就是页面标题，这里只留一行面包屑，把垂直空间让给编辑器 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/posts" className="transition-colors hover:text-foreground">
            文章
          </Link>
          <span className="mx-2" aria-hidden>
            /
          </span>
          编辑 · 第 {post.revision} 版
        </p>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/posts/${post.id}/revisions`}
            className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
          >
            版本历史
          </Link>
          {query.saved ? (
            <p className="rounded-md border border-green-300 bg-green-50 px-3 py-1 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
              已保存
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <PostEditorForm
          post={{ ...post, tagNames: tagRows.map((tag) => tag.name) }}
          canPublish={user.role === "editor" || user.role === "admin"}
          canPin={user.role === "editor" || user.role === "admin"}
          seriesOptions={seriesOptions}
        />
      </div>
    </section>
  );
}
