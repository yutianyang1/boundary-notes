import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readSponsorSlotDraft } from "@/lib/settings/sponsor";
import { SponsorForm } from "./sponsor-form";

export const metadata = { title: "站点设置" };

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/settings");
  // 布局只拦了 reader,这里再收紧到 admin:站点配置不是编辑该动的东西。
  if (session.user.role !== "admin") redirect("/admin");

  const sponsor = await readSponsorSlotDraft();

  return (
    <div>
      <h1 className="text-2xl font-bold">站点设置</h1>
      <section className="mt-10">
        <h2 className="text-lg font-semibold">文章页赞助位</h2>
        <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
          显示在文章页右侧目录下方。没有配置或停用时该位置完全不渲染，不会留下空框。
        </p>
        <SponsorForm initial={sponsor} />
      </section>
    </div>
  );
}
