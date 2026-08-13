import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireEditor } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";

const validStatuses = ["pending", "confirmed", "unsubscribed"] as const;
type Status = (typeof validStatuses)[number];
const labels: Record<Status, string> = { pending: "待确认", confirmed: "已确认", unsubscribed: "已退订" };
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await connection();
  await requireEditor();
  const requestedStatus = (await searchParams).status;
  const status = validStatuses.includes(requestedStatus as Status) ? requestedStatus as Status : null;
  const [rows, counts] = await Promise.all([
    db.select({
      id: subscribers.id,
      email: subscribers.email,
      status: subscribers.status,
      createdAt: subscribers.createdAt,
      confirmedAt: subscribers.confirmedAt,
      unsubscribedAt: subscribers.unsubscribedAt,
    }).from(subscribers)
      .where(status ? eq(subscribers.status, status) : undefined)
      .orderBy(desc(subscribers.createdAt))
      .limit(500),
    db.select({ status: subscribers.status, count: sql<number>`count(*)`.mapWith(Number) })
      .from(subscribers)
      .groupBy(subscribers.status),
  ]);
  const countByStatus = new Map(counts.map((item) => [item.status, item.count]));
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  return (
    <section>
      <p className="eyebrow text-primary">全站读者</p>
      <h1 className="headline mt-3 text-3xl">邮件订阅者</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">只读列表。订阅者必须通过邮件完成 double opt-in 确认。</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        <StatLink href="/admin/subscribers" label="全部" value={total} active={!status} />
        {validStatuses.map((item) => (
          <StatLink key={item} href={`/admin/subscribers?status=${item}`} label={labels[item]} value={countByStatus.get(item) ?? 0} active={status === item} />
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground">
              <tr><th className="px-5 py-3 font-medium">邮箱</th><th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">订阅时间</th><th className="px-5 py-3 font-medium">状态时间</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const stateAt = row.status === "confirmed" ? row.confirmedAt : row.status === "unsubscribed" ? row.unsubscribedAt : null;
                return (
                  <tr key={row.id}>
                    <td className="px-5 py-4 font-medium">{row.email}</td>
                    <td className="px-5 py-4"><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{labels[row.status]}</span></td>
                    <td className="px-5 py-4 tabular-nums text-muted-foreground">{dateFormatter.format(row.createdAt)}</td>
                    <td className="px-5 py-4 tabular-nums text-muted-foreground">{stateAt ? dateFormatter.format(stateAt) : "—"}</td>
                  </tr>
                );
              })}
              {!rows.length ? <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">当前筛选下没有订阅者。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      {rows.length === 500 ? <p className="mt-3 text-xs text-muted-foreground">当前仅显示最近 500 条记录。</p> : null}
    </section>
  );
}

function StatLink({ href, label, value, active }: { href: string; label: string; value: number; active: boolean }) {
  return (
    <Link href={href} className={`rounded-lg border p-4 ${active ? "border-primary bg-accent" : "bg-card hover:border-primary/40"}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-2xl tabular-nums">{value}</strong>
    </Link>
  );
}
