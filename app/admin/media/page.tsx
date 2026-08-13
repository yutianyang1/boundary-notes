import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MediaLibrary } from "@/components/admin/media-library";
import { canAccessMediaLibrary } from "@/lib/uploads/media-access";

export default async function AdminMediaPage() {
  await connection();
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessMediaLibrary(session.user.role)) redirect("/account");

  return (
    <section>
      <div>
        <p className="eyebrow text-primary">内容资产</p>
        <h1 className="headline mt-3 text-3xl">媒体库</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          上传一次即可跨文章复用。删除只会从列表隐藏，已发布文章中的图片不会失效。
        </p>
      </div>
      <div className="mt-8">
        <MediaLibrary />
      </div>
    </section>
  );
}
