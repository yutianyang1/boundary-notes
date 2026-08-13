"use client";

import { useEffect } from "react";
import { copyText } from "@/lib/browser/copy-text";

export function CodeCopyButtons() {
  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-article-body]");
    if (!article) return;
    const articleRoot = article;
    const resetTimers = new Map<HTMLButtonElement, number>();

    function enhance() {
      for (const pre of articleRoot.querySelectorAll<HTMLPreElement>("pre")) {
        if (pre.closest(".code-block-frame")) continue;
        const parent = pre.parentNode;
        if (!parent) continue;
        const frame = document.createElement("div");
        frame.className = "code-block-frame";
        parent.insertBefore(frame, pre);
        frame.append(pre);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "code-copy-button";
        button.textContent = "复制";
        button.setAttribute("aria-label", "复制代码");
        button.setAttribute("aria-live", "polite");
        frame.append(button);
      }
    }

    async function handleClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".code-copy-button");
      if (!button || !articleRoot.contains(button)) return;
      const code = button.closest(".code-block-frame")?.querySelector("pre code")?.textContent ?? "";
      button.disabled = true;
      try {
        await copyText(code);
        button.textContent = "已复制";
        button.dataset.state = "success";
      } catch {
        button.textContent = "复制失败";
        button.dataset.state = "error";
      } finally {
        button.disabled = false;
        const previous = resetTimers.get(button);
        if (previous !== undefined) window.clearTimeout(previous);
        resetTimers.set(button, window.setTimeout(() => {
          button.textContent = "复制";
          delete button.dataset.state;
          resetTimers.delete(button);
        }, 1_500));
      }
    }

    enhance();
    article.addEventListener("click", handleClick);
    const observer = new MutationObserver(() => enhance());
    observer.observe(article, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      article.removeEventListener("click", handleClick);
      for (const timer of resetTimers.values()) window.clearTimeout(timer);
      for (const frame of article.querySelectorAll<HTMLElement>(".code-block-frame")) {
        const pre = frame.querySelector(":scope > pre");
        if (pre) frame.replaceWith(pre);
      }
    };
  }, []);

  return null;
}
