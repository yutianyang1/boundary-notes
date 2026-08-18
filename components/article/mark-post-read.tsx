"use client";

import { useEffect, useRef } from "react";

/**
 * 停留时长门槛。正文末尾进入视口就算读完,对一屏装得下的短文来说
 * 是打开即成立——加这道门槛,划一眼就走的访问不会被记成读过。
 */
const DWELL_MS = 8_000;

/**
 * 标记「读完这篇」。渲染一个零高度哨兵放在正文之后,
 * 它进入视口即意味着读者已经翻到了正文末尾。
 *
 * 只在登录用户身上渲染,由 MarkPostReadServer 负责判断。
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
      // 失败就算了:下次再打开这篇还会重来一遍,不值得为它做重试队列。
      void fetch(`/api/posts/${encodeURIComponent(slug)}/read`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
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
