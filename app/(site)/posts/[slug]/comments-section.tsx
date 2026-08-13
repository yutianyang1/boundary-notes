import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { isStaffRole } from "@/lib/auth/roles";
import { getApprovedComments } from "@/lib/comments/queries";
import { renderComment } from "@/lib/comments/render";
import { CommentDeleteButton } from "./comment-delete-button";
import { CommentForm } from "./comment-form";

const relativeFormatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

export async function CommentsSection({ postId, slug, page }: { postId: string; slug: string; page: number }) {
  await connection();
  const [session, data] = await Promise.all([auth(), getApprovedComments(postId, page)]);
  const rendered = await Promise.all(data.comments.map(async (comment) => ({
    ...comment,
    html: comment.deletedAt ? null : await renderComment(comment.content),
    replies: await Promise.all(comment.replies.map(async (reply) => ({
      ...reply,
      html: reply.deletedAt ? null : await renderComment(reply.content),
    }))),
  })));

  return (
    <section id="comments" className="mt-12 rounded-[var(--radius-card)] border bg-card p-5 [box-shadow:var(--shadow)] sm:p-7">
      <div className="flex items-end justify-between gap-4 border-b pb-5">
        <div><p className="eyebrow text-primary">讨论</p><h2 className="headline-sm mt-2 text-2xl">评论</h2></div>
        <span className="text-sm tabular-nums text-muted-foreground">{data.count} 条</span>
      </div>

      {session?.user ? (
        <CommentForm postId={postId} slug={slug} />
      ) : (
        <div className="mt-5 rounded-lg bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
          <Link href={`/login?callbackUrl=${encodeURIComponent(`/posts/${slug}#comments`)}`} className="font-semibold text-primary hover:underline">登录</Link>
          后参与讨论。
        </div>
      )}

      <div className="mt-7 space-y-7">
        {rendered.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            postId={postId}
            slug={slug}
            currentUser={session?.user ?? null}
          />
        ))}
        {!rendered.length ? <p className="py-6 text-center text-sm text-muted-foreground">还没有评论，来留下第一条讨论吧。</p> : null}
      </div>

      {data.pages > 1 ? (
        <nav aria-label="评论分页" className="mt-7 flex items-center justify-between border-t pt-5 text-sm">
          {data.page > 1 ? <Link href={`/posts/${slug}?commentsPage=${data.page - 1}#comments`} className="text-primary hover:underline">← 上一页</Link> : <span />}
          <span className="tabular-nums text-muted-foreground">{data.page} / {data.pages}</span>
          {data.page < data.pages ? <Link href={`/posts/${slug}?commentsPage=${data.page + 1}#comments`} className="text-primary hover:underline">下一页 →</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}

type BaseCommentRow = Awaited<ReturnType<typeof getApprovedComments>>["comments"][number];
type RenderedReply = BaseCommentRow["replies"][number] & { html: string | null };
type CommentRow = Omit<BaseCommentRow, "replies"> & {
  html: string | null;
  replies: RenderedReply[];
};

function CommentCard({ comment, postId, slug, currentUser }: {
  comment: CommentRow;
  postId: string;
  slug: string;
  currentUser: Session["user"] | null;
}) {
  return (
    <article className="border-b border-hairline pb-7 last:border-0 last:pb-0">
      <CommentBody comment={comment} slug={slug} currentUser={currentUser} />
      {currentUser && !comment.deletedAt ? (
        <details className="ml-11 mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-primary">回复</summary>
          <CommentForm postId={postId} slug={slug} parentId={comment.id} compact />
        </details>
      ) : null}
      {comment.replies.length ? (
        <div className="ml-6 mt-5 space-y-5 border-l pl-4 sm:ml-11 sm:pl-5">
          {comment.replies.map((reply) => <CommentBody key={reply.id} comment={reply} slug={slug} currentUser={currentUser} />)}
        </div>
      ) : null}
    </article>
  );
}

function CommentBody({ comment, slug, currentUser }: {
  comment: Omit<CommentRow, "replies"> | RenderedReply;
  slug: string;
  currentUser: Session["user"] | null;
}) {
  const removedUser = !comment.userId || Boolean(comment.authorDeletedAt);
  const authorName = removedUser ? "已注销用户" : comment.authorName ?? "读者";
  const canDelete = currentUser && (currentUser.id === comment.userId || isStaffRole(currentUser.role));
  return (
    <div className="flex gap-3">
      {!removedUser && comment.authorImage ? (
        <Image src={comment.authorImage} alt="" width={36} height={36} unoptimized className="size-9 shrink-0 rounded-full border object-cover" />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold text-muted-foreground">{authorName.slice(0, 1)}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <strong className="text-sm">{authorName}</strong>
          <time dateTime={comment.createdAt.toISOString()} title={comment.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} className="text-xs text-muted-foreground">
            {relativeTime(comment.createdAt)}
          </time>
          {canDelete && !comment.deletedAt ? <CommentDeleteButton commentId={comment.id} slug={slug} /> : null}
        </div>
        {comment.deletedAt ? (
          <p className="mt-2 text-sm italic text-muted-foreground">该评论已删除</p>
        ) : (
          <div className="prose prose-sm mt-2 max-w-none break-words dark:prose-invert prose-a:text-primary prose-pre:overflow-x-auto" dangerouslySetInnerHTML={{ __html: comment.html ?? "" }} />
        )}
      </div>
    </div>
  );
}

function relativeTime(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1_000);
  if (Math.abs(seconds) < 60) return relativeFormatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relativeFormatter.format(days, "day");
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}
