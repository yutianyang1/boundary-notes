"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  READ_POSTS_CHANGED_EVENT,
  countRead,
  forgetPosts,
  isPostRead,
  loadRawReadPosts,
  parseReadPosts,
  saveReadPosts,
} from "@/lib/posts/read-progress";

function subscribe(onChange: () => void) {
  window.addEventListener(READ_POSTS_CHANGED_EVENT, onChange);
  // 另一个标签页读完了同系列的另一篇,这一页也该跟着变。
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(READ_POSTS_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * 服务端快照恒为 null:页面是预渲染的,进度在读者本地。
 * 首屏一律按「什么都没读」渲染,挂载后再补上,不会有 hydration 不一致。
 */
const serverSnapshot = () => null;

function useReadPosts() {
  const raw = useSyncExternalStore(subscribe, loadRawReadPosts, serverSnapshot);
  return useMemo(() => parseReadPosts(raw), [raw]);
}

/** 系列进度条。一篇都没读时整块不渲染——新读者不需要看到一个 0 / 7。 */
export function SeriesReadProgress({
  slugs,
  className = "",
  note = false,
}: {
  slugs: string[];
  className?: string;
  /** 是否附一句「只记在本机」。系列页上说一次就够,文章页不再重复。 */
  note?: boolean;
}) {
  const t = useTranslations("series");
  const state = useReadPosts();
  const read = countRead(state, slugs);
  const total = slugs.length;

  const reset = useCallback(() => {
    const next = forgetPosts(parseReadPosts(loadRawReadPosts()), slugs);
    if (next) saveReadPosts(next);
  }, [slugs]);

  if (!total || !read) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span className="tabular-nums">{t("progress", { read, total })}</span>
        <button
          type="button"
          onClick={reset}
          className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("resetProgress")}
        </button>
      </div>
      <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(read / total) * 100}%` }}
        />
      </div>
      {note ? <p className="mt-2 text-xs text-muted-foreground">{t("progressScope")}</p> : null}
    </div>
  );
}

/** 列表卡片上的「已读」角标。 */
export function PostReadBadge({ slug }: { slug: string }) {
  const t = useTranslations("series");
  const state = useReadPosts();
  if (!isPostRead(state, slug)) return null;

  return (
    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/65 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
      <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5 6.5 12 13 4.5" />
      </svg>
      {t("readBadge")}
    </span>
  );
}
