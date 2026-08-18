"use client";

import { useEffect, useRef } from "react";
import { loadRawReadPosts, markPostRead, parseReadPosts, saveReadPosts } from "@/lib/posts/read-progress";

/**
 * 停留时长门槛。正文末尾进入视口就算读完,对一屏装得下的短文来说
 * 是打开即成立——加这道门槛,划一眼就走的访问不会被记成读过。
 */
const DWELL_MS = 8_000;

/**
 * 标记「读完这篇」。渲染一个零高度哨兵,放在正文之后,
 * 它进入视口即意味着读者已经翻到了正文末尾。
 */
export function MarkPostRead({ slug }: { slug: string }) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    const openedAt = Date.now();
    let timer: number | undefined;
    let done = false;

    const record = () => {
      if (done) return;
      done = true;
      const next = markPostRead(parseReadPosts(loadRawReadPosts()), slug);
      if (next) saveReadPosts(next);
    };

    const observer = new IntersectionObserver((entries) => {
      // 后台标签页里的 IntersectionObserver 不会触发,不必额外判可见性。
      if (!entries.some((entry) => entry.isIntersecting) || done || timer !== undefined) return;
      const waited = Date.now() - openedAt;
      if (waited >= DWELL_MS) {
        record();
        observer.disconnect();
        return;
      }
      timer = window.setTimeout(() => {
        timer = undefined;
        record();
        observer.disconnect();
      }, DWELL_MS - waited);
    });

    observer.observe(sentinel);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [slug]);

  return <div ref={sentinelRef} aria-hidden className="h-px" />;
}
