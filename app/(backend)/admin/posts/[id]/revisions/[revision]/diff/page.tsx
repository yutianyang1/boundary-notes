import { and, desc, eq, isNull, lte } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { canManagePost, requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { postRevisions, posts, users } from "@/lib/db/schema";
import {
  diffLines,
  numberAndCollapseDiff,
  type NumberedDiffRow,
} from "@/lib/posts/diff";

const statusLabels = {
  draft: "草稿",
  in_review: "待审核",
  scheduled: "定时",
  published: "已发布",
  archived: "已归档",
} as const;

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function RevisionDiffPage({
  params,
}: {
  params: Promise<{ id: string; revision: string }>;
}) {
  await connection();
  const [{ id, revision: rawRevision }, user] = await Promise.all([params, requireStaff()]);
  const revisionNumber = Number.parseInt(rawRevision, 10);
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber <= 1 || String(revisionNumber) !== rawRevision) {
    notFound();
  }

  const [post] = await db
    .select({ id: posts.id, title: posts.title, authorId: posts.authorId })
    .from(posts)
    .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
    .limit(1);
  if (!post || !canManagePost(user, post.authorId)) notFound();

  const revisions = await db
    .select({
      revision: postRevisions.revision,
      title: postRevisions.title,
      summary: postRevisions.summary,
      contentMd: postRevisions.contentMd,
      status: postRevisions.status,
      createdAt: postRevisions.createdAt,
      creatorName: users.name,
    })
    .from(postRevisions)
    .innerJoin(users, eq(postRevisions.createdBy, users.id))
    .where(and(
      eq(postRevisions.postId, id),
      lte(postRevisions.revision, revisionNumber),
    ))
    .orderBy(desc(postRevisions.revision))
    .limit(2);

  const [current, previous] = revisions;
  if (!current || current.revision !== revisionNumber || !previous) notFound();

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/admin/posts/${post.id}/revisions`} className="hover:text-foreground">
              返回版本历史
            </Link>
          </p>
          <h1 className="headline mt-3 text-3xl">
            v{previous.revision} → v{current.revision}
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">{post.title}</p>
        </div>
        <Link
          href={`/admin/posts/${post.id}`}
          className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          返回编辑
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <RevisionMeta label={`v${previous.revision}`} revision={previous} />
        <RevisionMeta label={`v${current.revision}`} revision={current} />
      </div>

      <div className="mt-6 rounded-lg border bg-card p-5">
        <p className="text-sm text-muted-foreground">状态变化</p>
        <p className="mt-2 font-semibold">
          {statusLabels[previous.status]}
          <span className="mx-3 text-muted-foreground">→</span>
          {statusLabels[current.status]}
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <DiffPanel title="标题" before={previous.title} after={current.title} compact />
        <DiffPanel title="摘要" before={previous.summary} after={current.summary} />
        <DiffPanel title="Markdown 正文" before={previous.contentMd} after={current.contentMd} />
      </div>
    </section>
  );
}

function RevisionMeta({
  label,
  revision,
}: {
  label: string;
  revision: { creatorName: string; createdAt: Date };
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="font-semibold">{label}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {revision.creatorName} · {dateFormatter.format(revision.createdAt)}
      </p>
    </div>
  );
}

function DiffPanel({
  title,
  before,
  after,
  compact = false,
}: {
  title: string;
  before: string;
  after: string;
  compact?: boolean;
}) {
  const operations = diffLines(before, after);
  const unchanged = operations.every((operation) => operation.type === "equal");
  const rows = unchanged ? [] : numberAndCollapseDiff(operations, compact ? 1 : 3);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="headline-sm text-lg">{title}</h2>
        {unchanged ? <span className="text-xs text-muted-foreground">未变化</span> : null}
      </div>
      {unchanged ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">这一项与上一版相同。</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[42rem] font-mono text-[13px] leading-6">
            {rows.map((row, index) => (
              <DiffRow key={`${index}:${row.type}`} row={row} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DiffRow({ row }: { row: NumberedDiffRow }) {
  if (row.type === "skip") {
    return (
      <div className="border-y border-blue-200 bg-blue-50 px-4 py-1 text-center text-xs text-blue-700 dark:border-blue-950 dark:bg-blue-950/30 dark:text-blue-300">
        省略 {row.count} 行未修改内容
      </div>
    );
  }

  const tone = row.type === "add"
    ? "bg-green-50 text-green-950 dark:bg-green-950/30 dark:text-green-100"
    : row.type === "remove"
      ? "bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100"
      : "";
  const marker = row.type === "add" ? "+" : row.type === "remove" ? "−" : " ";

  return (
    <div className={`grid grid-cols-[3.5rem_3.5rem_1.75rem_minmax(0,1fr)] border-b border-hairline last:border-b-0 ${tone}`}>
      <span className="select-none border-r border-hairline px-2 text-right tabular-nums text-muted-foreground">
        {row.oldLine ?? ""}
      </span>
      <span className="select-none border-r border-hairline px-2 text-right tabular-nums text-muted-foreground">
        {row.newLine ?? ""}
      </span>
      <span className="select-none text-center font-bold">{marker}</span>
      <code className="whitespace-pre-wrap break-words pr-4">{row.value || " "}</code>
    </div>
  );
}
