import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { isEditorRole } from "@/lib/auth/roles";
import { areCommentsEnabled } from "@/lib/features";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<AdminSkeleton />}><AdminShell>{children}</AdminShell></Suspense>;
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  await connection();
  const [session, requestHeaders] = await Promise.all([auth(), headers()]);
  const currentPath = requestHeaders.get("x-current-path") ?? "/admin";
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(currentPath)}`);
  if (session.authState !== "full") {
    redirect(session.authState === "mfa_pending" ? "/mfa/challenge?callbackUrl=/admin" : "/mfa/enroll");
  }
  if (session.user.role === "reader") redirect("/account");

  return (
    <div className="shell py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/admin" className="font-semibold">工作台</Link>
          <Link href="/admin/posts" className="text-muted-foreground hover:text-foreground">文章</Link>
          <Link href="/admin/series" className="text-muted-foreground hover:text-foreground">系列</Link>
          <Link href="/admin/media" className="text-muted-foreground hover:text-foreground">媒体库</Link>
          {isEditorRole(session.user.role) ? <Link href="/admin/subscribers" className="text-muted-foreground hover:text-foreground">订阅者</Link> : null}
          {isEditorRole(session.user.role) && areCommentsEnabled() ? <Link href="/admin/comments" className="text-muted-foreground hover:text-foreground">评论</Link> : null}
          {session.user.role === "admin" ? <Link href="/admin/settings" className="text-muted-foreground hover:text-foreground">设置</Link> : null}
          <Link href="/" className="text-muted-foreground hover:text-foreground">访问站点</Link>
        </nav>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{session.user.name ?? session.user.email}</span>
          <SignOutButton className="rounded-md border px-3 py-1.5 hover:bg-muted hover:text-foreground disabled:opacity-60">退出</SignOutButton>
        </div>
      </div>
      {children}
    </div>
  );
}

function AdminSkeleton() {
  return <div className="shell min-h-[60vh] animate-pulse py-8"><div className="h-12 rounded-md bg-muted" /><div className="mt-10 h-8 w-64 rounded bg-muted" /></div>;
}
