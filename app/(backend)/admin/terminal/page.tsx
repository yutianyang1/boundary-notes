import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TerminalConsole } from "@/components/admin/terminal-console";
import { isWebSshEnabled } from "@/lib/features";
import { requireAdmin } from "@/lib/auth/permissions";

export const metadata = { title: "SSH 终端" };

export default async function AdminTerminalPage() {
  await connection();
  if (!isWebSshEnabled()) notFound();
  await requireAdmin();

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow text-primary">Admin tool</p>
        <h1 className="headline mt-2 text-3xl">SSH 终端</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          连接由博客服务器中转。密码和私钥只保留在当前浏览器与连接内存中，不会写入数据库；
          首次连接必须核对目标主机的 SHA256 指纹。
        </p>
      </div>
      <TerminalConsole />
    </div>
  );
}
