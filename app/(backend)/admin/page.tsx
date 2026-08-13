import Link from "next/link";
import { and, asc, desc, eq, gt, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  auditLogs,
  mailOutbox,
  posts,
  postViewCounts,
  postViewDaily,
  users,
} from "@/lib/db/schema";
import { buildDailyViewSeries } from "@/lib/posts/view-analytics";

const statusLabels = {
  draft: "草稿",
  in_review: "审核中",
  scheduled: "定时",
  published: "已发布",
  archived: "归档",
} as const;

const actionLabels: Record<string, string> = {
  "post.create": "创建了文章",
  "post.update": "更新了文章",
  "post.delete": "删除了文章",
  "account.profile.update": "更新了账户资料",
  "account.avatar.update": "更新了头像",
  "account.password.change": "修改了密码",
  "account.session.revoke": "下线了一个设备",
  "account.sessions.revoke_others": "退出了其他设备",
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

const totalViewCount = sql<number>`coalesce(${postViewCounts.viewCount}, 0)`.mapWith(Number);
const dailyViewCount = sql<number>`coalesce(sum(${postViewDaily.viewCount}), 0)`.mapWith(Number);

export default async function AdminPage() {
  const user = await requireStaff();
  const canSeeAllPosts = user.role === "editor" || user.role === "admin";
  const canSeeSystemData = user.role === "admin";
  const ownership = canSeeAllPosts ? undefined : eq(posts.authorId, user.id);
  const postWhere = ownership ? and(isNull(posts.deletedAt), ownership) : isNull(posts.deletedAt);
  const currentlyPublic = or(
    eq(posts.status, "published"),
    and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql<Date>`now()`)),
  );
  const analyticsNow = new Date();
  const emptyDailySeries = buildDailyViewSeries([], 14, analyticsNow);
  const dailyStart = emptyDailySeries[0].day;

  const [
    statusRows,
    recentPosts,
    recentActivity,
    mailRows,
    [scheduledRisk],
    popularPosts,
    dailyRows,
  ] = await Promise.all([
    db
      .select({ status: posts.status, count: sql<number>`count(*)`.mapWith(Number) })
      .from(posts)
      .where(postWhere)
      .groupBy(posts.status),
    db
      .select({
        id: posts.id,
        title: posts.title,
        status: posts.status,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .where(postWhere)
      .orderBy(desc(posts.updatedAt))
      .limit(6),
    canSeeSystemData
      ? db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            targetType: auditLogs.targetType,
            targetId: auditLogs.targetId,
            createdAt: auditLogs.createdAt,
            actorName: users.name,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.actorId, users.id))
          .orderBy(desc(auditLogs.createdAt))
          .limit(8)
      : Promise.resolve([]),
    canSeeSystemData
      ? db
          .select({ status: mailOutbox.status, count: sql<number>`count(*)`.mapWith(Number) })
          .from(mailOutbox)
          .where(ne(mailOutbox.status, "sent"))
          .groupBy(mailOutbox.status)
      : Promise.resolve([]),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(posts)
      .where(and(postWhere, eq(posts.status, "scheduled"))),
    db
      .select({
        id: posts.id,
        title: posts.title,
        viewCount: totalViewCount,
      })
      .from(posts)
      .leftJoin(postViewCounts, eq(posts.id, postViewCounts.postId))
      .where(and(postWhere, currentlyPublic, gt(postViewCounts.viewCount, 0)))
      .orderBy(desc(totalViewCount), desc(posts.publishedAt))
      .limit(5),
    db
      .select({
        day: postViewDaily.day,
        viewCount: dailyViewCount,
      })
      .from(postViewDaily)
      .innerJoin(posts, eq(postViewDaily.postId, posts.id))
      .where(and(postWhere, gte(postViewDaily.day, dailyStart)))
      .groupBy(postViewDaily.day)
      .orderBy(asc(postViewDaily.day)),
  ]);

  const statusCounts = new Map(statusRows.map((row) => [row.status, row.count]));
  const mailCounts = new Map(mailRows.map((row) => [row.status, row.count]));
  const pendingMail = (mailCounts.get("pending") ?? 0) + (mailCounts.get("sending") ?? 0);
  const failedMail = mailCounts.get("failed") ?? 0;
  const dailySeries = buildDailyViewSeries(dailyRows, 14, analyticsNow);
  const maxDailyViews = Math.max(1, ...dailySeries.map((item) => item.viewCount));
  const recentViewTotal = dailySeries.reduce((total, item) => total + item.viewCount, 0);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">内容工作台</p>
          <h1 className="headline mt-3 text-3xl">今天从哪里开始？</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            查看内容状态、最近操作与需要处理的风险。
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/posts/new" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            新建文章
          </Link>
          <Link href="/admin/posts" className="rounded-md border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            管理文章
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Object.entries(statusLabels).map(([status, label]) => (
          <div key={status} className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 text-3xl font-bold tabular-nums">
              {statusCounts.get(status as keyof typeof statusLabels) ?? 0}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="headline-sm text-xl">热门文章</h2>
              <p className="mt-1 text-sm text-muted-foreground">按累计有效浏览量排行</p>
            </div>
            <Link href="/admin/posts" className="text-sm font-semibold text-primary hover:underline">
              查看全部
            </Link>
          </div>
          <div className="divide-y">
            {popularPosts.length ? popularPosts.map((post, index) => (
              <Link
                key={post.id}
                href={`/admin/posts/${post.id}`}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 p-4 transition-colors hover:bg-muted/50"
              >
                <span className="text-center text-sm font-bold tabular-nums text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="truncate text-sm font-semibold">{post.title}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {post.viewCount.toLocaleString("zh-CN")} 次
                </span>
              </Link>
            )) : (
              <p className="p-5 text-sm text-muted-foreground">还没有可排行的文章。</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b p-5">
            <div>
              <h2 className="headline-sm text-xl">近 14 天浏览趋势</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                每日数据从本功能上线日起积累，不回溯历史浏览。
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              合计 <strong className="text-lg tabular-nums text-foreground">{recentViewTotal.toLocaleString("zh-CN")}</strong> 次
            </p>
          </div>
          <div className="p-5">
            <div className="flex h-36 items-end gap-1.5" aria-label="最近十四天每日浏览量">
              {dailySeries.map((item) => {
                const height = item.viewCount
                  ? `${Math.max(4, (item.viewCount / maxDailyViews) * 100)}%`
                  : "2px";
                return (
                  <div key={item.day} className="group flex h-full min-w-0 flex-1 items-end">
                    <div
                      title={`${item.day}：${item.viewCount} 次浏览`}
                      style={{ height }}
                      className="w-full rounded-t-sm bg-primary/70 transition-colors hover:bg-primary"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[0.6875rem] tabular-nums text-muted-foreground">
              <span>{dailySeries[0].day.slice(5).replace("-", "/")}</span>
              <span>{dailySeries.at(-1)?.day.slice(5).replace("-", "/")}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="headline-sm text-xl">最近文章</h2>
              <p className="mt-1 text-sm text-muted-foreground">按最后更新时间排列</p>
            </div>
            <Link href="/admin/posts" className="text-sm font-semibold text-primary hover:underline">查看全部</Link>
          </div>
          <div className="divide-y">
            {recentPosts.length ? recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/admin/posts/${post.id}`}
                className="grid gap-2 p-5 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
              >
                <span className="truncate font-semibold">{post.title}</span>
                <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {statusLabels[post.status]}
                </span>
                <time className="text-xs tabular-nums text-muted-foreground">
                  {dateFormatter.format(post.updatedAt)}
                </time>
              </Link>
            )) : (
              <p className="p-5 text-sm text-muted-foreground">还没有文章。</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <div className="border-b p-5">
            <h2 className="headline-sm text-xl">待办与风险</h2>
            <p className="mt-1 text-sm text-muted-foreground">需要关注的系统状态</p>
          </div>
          <div className="space-y-3 p-5">
            <RiskRow label="等待定时发布" value={scheduledRisk?.count ?? 0} tone="normal" />
            {canSeeSystemData ? (
              <>
                <RiskRow label="等待发送邮件" value={pendingMail} tone="normal" />
                <RiskRow label="发送失败邮件" value={failedMail} tone={failedMail ? "danger" : "normal"} />
              </>
            ) : null}
            {!scheduledRisk?.count && !pendingMail && !failedMail ? (
              <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">当前没有需要处理的风险。</p>
            ) : null}
          </div>
        </section>
      </div>

      {canSeeSystemData ? (
        <section className="mt-6 rounded-lg border bg-card">
          <div className="border-b p-5">
            <h2 className="headline-sm text-xl">最近活动</h2>
            <p className="mt-1 text-sm text-muted-foreground">来自审计日志的最新操作</p>
          </div>
          <div className="divide-y">
            {recentActivity.length ? recentActivity.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <p className="text-sm">
                  <span className="font-semibold">{item.actorName ?? "系统"}</span>
                  <span className="text-muted-foreground"> {actionLabels[item.action] ?? item.action}</span>
                  {item.targetType === "post" && item.targetId ? (
                    <Link href={`/admin/posts/${item.targetId}`} className="ml-2 text-primary hover:underline">查看</Link>
                  ) : null}
                </p>
                <time className="text-xs tabular-nums text-muted-foreground">
                  {dateFormatter.format(item.createdAt)}
                </time>
              </div>
            )) : (
              <p className="p-5 text-sm text-muted-foreground">还没有审计记录。</p>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function RiskRow({ label, value, tone }: { label: string; value: number; tone: "normal" | "danger" }) {
  return (
    <div className={`flex items-center justify-between rounded-md border p-4 ${tone === "danger" ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${tone === "danger" ? "text-red-700 dark:text-red-400" : ""}`}>{value}</span>
    </div>
  );
}
