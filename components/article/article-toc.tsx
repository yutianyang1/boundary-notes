"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/markdown/toc";

export function ArticleToc({ items, compact = false }: { items: TocItem[]; compact?: boolean }) {
  const t = useTranslations("post");
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-article-body]");
    if (!article) return;

    let intersectionObserver: IntersectionObserver | null = null;
    let animationFrame = 0;

    function observeCurrentHeadings() {
      intersectionObserver?.disconnect();
      const headings = items
        .map((item) => document.getElementById(item.id))
        .filter((heading): heading is HTMLElement => Boolean(heading));
      if (!headings.length) return;

      intersectionObserver = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]?.target.id) setActiveId(visible[0].target.id);
        },
        { rootMargin: "-18% 0px -72% 0px" },
      );
      headings.forEach((heading) => intersectionObserver?.observe(heading));
    }

    observeCurrentHeadings();
    const mutationObserver = new MutationObserver(() => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(observeCurrentHeadings);
    });
    mutationObserver.observe(article, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      mutationObserver.disconnect();
      intersectionObserver?.disconnect();
    };
  }, [items]);

  return (
    <nav aria-label={t("tocLabel")}>
      <ol className={compact ? "space-y-2" : "space-y-1 border-l-2 border-hairline"}>
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? "pl-4" : undefined}>
            <a
              href={`#${item.id}`}
              aria-current={activeId === item.id ? "location" : undefined}
              className={`block border-l-2 py-1 pl-3 text-sm leading-6 transition-colors ${
                compact ? "" : "-ml-0.5"
              } ${
                activeId === item.id
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {/* 目录条目取自文章标题，语言随正文。 */}
              <span lang="zh-CN">{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
