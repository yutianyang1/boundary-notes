"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { createCommentAction, type CommentActionState } from "./comment-actions";

const initialState: CommentActionState = {};

export function CommentForm({ postId, slug, parentId, compact = false }: {
  postId: string;
  slug: string;
  parentId?: string;
  compact?: boolean;
}) {
  const t = useTranslations("comments");
  // 动作返回的是 comments 命名空间下的完整 key（errors.xxx）。
  const tAll = useTranslations("comments");
  const [state, action, pending] = useActionState(createCommentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) formRef.current?.reset(); }, [state.success]);
  return (
    <form ref={formRef} action={action} className={compact ? "mt-3" : "mt-5"}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="slug" value={slug} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <textarea
        name="content"
        required
        maxLength={2_000}
        rows={compact ? 3 : 5}
        placeholder={compact ? t("replyPlaceholder") : t("placeholder")}
        className="w-full resize-y rounded-md border bg-background px-3.5 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p role="status" className={`text-xs ${state.errorKey ? "text-danger" : "text-muted-foreground"}`}>
          {state.errorKey ? tAll(state.errorKey) : state.success ? t("posted") : t("maxLength")}
        </p>
        <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {pending ? t("submitting") : parentId ? t("reply") : t("submit")}
        </button>
      </div>
    </form>
  );
}
