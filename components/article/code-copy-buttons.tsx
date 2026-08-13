"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { copyText } from "@/lib/browser/copy-text";

export function CodeCopyButtons() {
  const t = useTranslations("post");
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
        button.textContent = t("copy");
        button.setAttribute("aria-label", t("copyCode"));
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
        button.textContent = t("copySucceeded");
        button.dataset.state = "success";
      } catch {
        button.textContent = t("copyFailed");
        button.dataset.state = "error";
      } finally {
        button.disabled = false;
        const previous = resetTimers.get(button);
        if (previous !== undefined) window.clearTimeout(previous);
        resetTimers.set(button, window.setTimeout(() => {
          button.textContent = t("copy");
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
    // t 随 locale 变化会重挂载，正是我们要的：按钮文案跟着换。
  }, [t]);

  return null;
}
