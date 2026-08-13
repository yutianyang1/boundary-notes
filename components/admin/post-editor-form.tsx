"use client";

import { useActionState, useState } from "react";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { CoverUploader } from "@/components/admin/cover-uploader";
import { savePostAction, type PostActionState } from "@/app/admin/posts/actions";
import { normalizeSlug } from "@/lib/posts/slug";

type EditablePost = {
  id?: string;
  revision?: number;
  title?: string;
  slug?: string;
  summary?: string;
  contentMd?: string;
  status?: "draft" | "in_review" | "scheduled" | "published" | "archived";
  pinned?: boolean;
  publishedAt?: Date | null;
  cover?: string | null;
  tagNames?: string[];
  seriesId?: string | null;
  seriesOrder?: number | null;
};

type SeriesOption = { id: string; name: string };

const initialState: PostActionState = {};

const fieldClass =
  "mt-2 h-10 w-full rounded-md border bg-background px-3 outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30";

function localDateTime(value?: Date | null) {
  if (!value) return "";
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function PostEditorForm({
  post,
  canPublish,
  canPin,
  seriesOptions,
}: {
  post?: EditablePost;
  canPublish: boolean;
  canPin: boolean;
  seriesOptions: SeriesOption[];
}) {
  const [state, action, pending] = useActionState(savePostAction, initialState);
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [seriesId, setSeriesId] = useState(post?.seriesId ?? "");
  /** 已有文章的 slug 视为已确定，不再跟随标题变化（改 slug 会产生重定向记录）。 */
  const [slugTouched, setSlugTouched] = useState(Boolean(post?.slug));

  const effectiveSlug = slugTouched ? slug : normalizeSlug(title);

  return (
    <form action={action} className="space-y-4">
      {post?.id ? <input type="hidden" name="id" value={post.id} /> : null}
      <input type="hidden" name="revision" value={post?.revision ?? 1} />

      {/* 标题与操作留在首屏，保存按钮不再需要滚动才能够到 */}
      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        <input
          name="title"
          aria-label="文章标题"
          placeholder="文章标题"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={240}
          className="min-w-0 flex-1 basis-full border-0 bg-transparent p-0 text-3xl font-bold outline-none placeholder:text-muted-foreground/40 sm:basis-0"
        />
        <select
          name="status"
          aria-label="状态"
          defaultValue={post?.status ?? "draft"}
          className="h-10 shrink-0 rounded-md border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        >
          <option value="draft">草稿</option>
          <option value="in_review">待审核</option>
          {canPublish ? <option value="scheduled">定时发布</option> : null}
          {canPublish ? <option value="published">已发布</option> : null}
          {canPublish ? <option value="archived">已归档</option> : null}
        </select>
        <button
          disabled={pending}
          className="h-10 shrink-0 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "正在保存…" : "保存文章"}
        </button>
      </div>

      <details className="rounded-lg border bg-card">
        <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-4 py-2.5 text-sm font-medium">
          <span>文章设置</span>
          <span className="truncate font-mono text-xs font-normal text-muted-foreground">
            /{effectiveSlug || "自动生成"}
          </span>
        </summary>
        <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Slug
            {/* 不加 required：折叠状态下的空必填项会让浏览器报「无法聚焦」而卡住提交，交给服务端校验 */}
            <input
              name="slug"
              value={effectiveSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              maxLength={240}
              placeholder="留空则由标题生成"
              className={`${fieldClass} font-mono`}
            />
          </label>
          {canPublish ? (
            <label className="text-sm font-medium">
              发布时间（定时发布时必填）
              <input
                name="publishAt"
                type="datetime-local"
                defaultValue={localDateTime(post?.publishedAt)}
                className={fieldClass}
              />
            </label>
          ) : null}
          {canPin ? (
            <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
              <input
                name="pinned"
                type="checkbox"
                defaultChecked={post?.pinned ?? false}
                className="size-4 rounded border accent-[var(--primary)]"
              />
              置顶文章
              <span className="font-normal text-muted-foreground">置顶后优先显示在首页和文章归档顶部</span>
            </label>
          ) : null}
          <label className="text-sm font-medium sm:col-span-2">
            摘要
            <textarea
              name="summary"
              defaultValue={post?.summary}
              maxLength={1000}
              rows={3}
              className="mt-2 w-full rounded-md border bg-background p-3 outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            标签
            <input
              name="tags"
              defaultValue={post?.tagNames?.join("、")}
              maxLength={500}
              placeholder="例如：PostgreSQL、性能优化、架构"
              className={fieldClass}
            />
            <span className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">
              用中文顿号、逗号或换行分隔，最多 8 个；不存在的标签会在保存时自动创建。
            </span>
          </label>
          <label className="text-sm font-medium">
            所属系列
            <select
              name="seriesId"
              value={seriesId}
              onChange={(event) => setSeriesId(event.target.value)}
              className={fieldClass}
            >
              <option value="">不属于系列</option>
              {seriesOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            系列内序号
            <input
              name="seriesOrder"
              type="number"
              min={1}
              step={1}
              defaultValue={post?.seriesOrder ?? ""}
              disabled={!seriesId}
              required={Boolean(seriesId)}
              placeholder={seriesId ? "从 1 开始" : "选择系列后填写"}
              className={fieldClass}
            />
          </label>
          <CoverUploader initialUrl={post?.cover} />
        </div>
      </details>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <MarkdownEditor initialValue={post?.contentMd ?? ""} />
    </form>
  );
}
