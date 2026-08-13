"use client";

import { useActionState } from "react";
import { deleteCommentAction, type CommentActionState } from "./comment-actions";

export function CommentDeleteButton({ commentId, slug }: { commentId: string; slug: string }) {
  const [state, action, pending] = useActionState<CommentActionState, FormData>(deleteCommentAction, {});
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="slug" value={slug} />
      <button disabled={pending} className="text-xs text-muted-foreground hover:text-danger disabled:opacity-60">
        {pending ? "删除中…" : "删除"}
      </button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
