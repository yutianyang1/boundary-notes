"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

type ViewedTable = { title: string; rows: number; columns: number };

/** lucide「maximize-2」，按钮是命令式插进正文的，没法直接用 React 图标组件。 */
const EXPAND_ICON =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

/**
 * 表格放大查看。
 *
 * 正文栏只有 40em，多列表格在里面挤得几乎格格折行。正文里保持原样，每张表上方加一个
 * 「放大查看」按钮，点开后在弹窗里单独排版：足够宽、表头固定、隔行底色、放不下时横竖
 * 都能滚动。
 *
 * 做法与 CodeCopyButtons 一致：客户端给正文里的 <table> 包一层 .table-frame 再插按钮，
 * 弹窗里放的是原表的深拷贝（去掉 id，免得页面上出现重复 id），不重新解析 HTML。
 * 弹窗用原生 <dialog> 的 showModal：Esc 关闭、焦点锁定、背景不可交互都是浏览器给的。
 * 弹窗宽度跟着表格内容走（w-fit，上下限 36rem / 90rem）：两列的小表不必摊成一整屏宽。
 */
export function TableViewer() {
  const t = useTranslations("post");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cloneRef = useRef<HTMLTableElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sourceRef = useRef<HTMLTableElement | null>(null);
  const [current, setCurrent] = useState<ViewedTable | null>(null);

  const open = useCallback((table: HTMLTableElement, trigger: HTMLButtonElement) => {
    const clone = table.cloneNode(true) as HTMLTableElement;
    clone.removeAttribute("id");
    for (const el of clone.querySelectorAll("[id]")) el.removeAttribute("id");
    cloneRef.current = clone;
    triggerRef.current = trigger;
    sourceRef.current = table;

    const rows = table.tBodies.length
      ? [...table.tBodies].reduce((sum, body) => sum + body.rows.length, 0)
      : Math.max(0, table.rows.length - (table.tHead?.rows.length ?? 0));
    const columns = Math.max(0, ...[...table.rows].map((row) => row.cells.length));

    setCurrent({ title: nearestHeading(table) ?? t("tablePreview"), rows, columns });
    dialogRef.current?.showModal();
  }, [t]);

  // 渲染出弹窗骨架后再把拷贝挂进去；换一张表时先清空。
  useEffect(() => {
    const body = bodyRef.current;
    if (!current || !body || !cloneRef.current) return;
    body.replaceChildren(cloneRef.current);
    body.scrollTo(0, 0);
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [current]);

  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-article-body]");
    if (!article) return;
    const articleRoot = article;

    function enhance() {
      for (const table of articleRoot.querySelectorAll<HTMLTableElement>("table")) {
        if (table.closest(".table-frame")) continue;
        const parent = table.parentNode;
        if (!parent) continue;
        const frame = document.createElement("div");
        frame.className = "table-frame";
        const bar = document.createElement("div");
        bar.className = "table-frame-bar";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-expand-button";
        button.setAttribute("aria-label", t("expandTable"));
        button.innerHTML = `${EXPAND_ICON}<span>${escapeHtml(t("expandTableLabel"))}</span>`;
        bar.append(button);
        parent.insertBefore(frame, table);
        frame.append(bar, table);
      }
    }

    function handleClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".table-expand-button");
      if (!button || !articleRoot.contains(button)) return;
      const table = button.closest(".table-frame")?.querySelector<HTMLTableElement>(":scope > table");
      if (table) open(table, button);
    }

    enhance();
    article.addEventListener("click", handleClick);
    const observer = new MutationObserver(() => enhance());
    observer.observe(article, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      article.removeEventListener("click", handleClick);
      for (const frame of article.querySelectorAll<HTMLElement>(".table-frame")) {
        const table = frame.querySelector(":scope > table");
        if (table) frame.replaceWith(table);
      }
    };
    // t 随 locale 变化会重挂载，按钮文案跟着换。
  }, [open, t]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={t("tablePreview")}
      onClose={() => {
        setCurrent(null);
        bodyRef.current?.replaceChildren();
        // 焦点还给打开它的按钮。按钮若在弹窗打开期间被重建过（正文重新渲染等），
        // 就按原表格找回它现在所在外框里的那个按钮。
        const trigger = triggerRef.current?.isConnected
          ? triggerRef.current
          : sourceRef.current?.closest(".table-frame")?.querySelector<HTMLButtonElement>(".table-expand-button");
        trigger?.focus();
      }}
      // 点到弹窗外的遮罩时，事件目标就是 <dialog> 本身。
      onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}
      className="m-auto max-h-[90dvh] w-fit min-w-[min(96vw,36rem)] max-w-[min(96vw,90rem)] flex-col overflow-hidden rounded-[var(--radius-card)] border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-sm open:flex open:[animation:overlay-in_140ms_ease-out] motion-reduce:open:animate-none"
    >
      <div className="flex shrink-0 items-center gap-4 border-b px-5 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p lang="zh-CN" className="headline-sm truncate text-base">{current?.title}</p>
          {current ? (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {t("tableSize", { rows: current.rows, columns: current.columns })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t("closeTablePreview")}
          onClick={() => dialogRef.current?.close()}
          className="grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>
      <div ref={bodyRef} className="table-viewer-body min-h-0 flex-1 overflow-auto" />
    </dialog>
  );
}

/** 表格所在小节的标题：往前找最近的 h2–h4，作为弹窗标题。 */
function nearestHeading(table: HTMLTableElement) {
  let node: Element | null = table.closest(".table-frame") ?? table;
  while (node) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (/^H[2-4]$/.test(sibling.tagName)) return sibling.textContent?.trim() || null;
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement?.closest("[data-article-body]") === node.parentElement ? null : node.parentElement;
  }
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
