"use client";

import { useEffect } from "react";
import { shouldRecordView, viewStorageKey } from "@/lib/posts/views";

const QUALIFIED_VIEW_DELAY_MS = 4_000;

export function PostViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const storageKey = viewStorageKey(slug);
    let timer: number | undefined;
    let sent = false;

    const record = async () => {
      if (sent) return;
      let previous: string | null = null;
      try {
        previous = window.localStorage.getItem(storageKey);
      } catch {
        // 隐私模式可能禁用 localStorage；仍允许本次页面生命周期计数一次。
      }
      if (!shouldRecordView(previous)) return;

      sent = true;
      try {
        window.localStorage.setItem(storageKey, String(Date.now()));
      } catch {
        // 存储不可用不影响匿名计数。
      }

      try {
        const response = await fetch(`/api/posts/${encodeURIComponent(slug)}/view`, {
          method: "POST",
          keepalive: true,
        });
        if (!response.ok) throw new Error("view counter rejected");
      } catch {
        sent = false;
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // 下次完整访问时再重试。
        }
      }
    };

    const schedule = () => {
      if (sent || timer !== undefined || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void record();
      }, QUALIFIED_VIEW_DELAY_MS);
    };

    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [slug]);

  return null;
}
