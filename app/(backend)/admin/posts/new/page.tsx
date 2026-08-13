import Link from "next/link";
import { PostEditorForm } from "@/components/admin/post-editor-form";
import { requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";
import { isNull } from "drizzle-orm";

export default async function NewPostPage() {
  const [user, seriesOptions] = await Promise.all([
    requireStaff(),
    db
      .select({ id: series.id, name: series.name })
      .from(series)
      .where(isNull(series.deletedAt))
      .orderBy(series.name),
  ]);
  return (
    <section>
      {/* 标题输入框本身就是页面标题，这里只留一行面包屑，把垂直空间让给编辑器 */}
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/posts" className="transition-colors hover:text-foreground">
          文章
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        新建
      </p>
      <div className="mt-4">
        <PostEditorForm
          canPublish={user.role === "editor" || user.role === "admin"}
          canPin={user.role === "editor" || user.role === "admin"}
          seriesOptions={seriesOptions}
        />
      </div>
    </section>
  );
}
