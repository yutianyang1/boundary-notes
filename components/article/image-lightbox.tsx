"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ZoomedImage = { src: string; alt: string; diagram: boolean };
type ZoomTarget = HTMLImageElement | SVGSVGElement;

export function ImageLightbox() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState<ZoomedImage | null>(null);

  const open = useCallback((target: ZoomTarget) => {
    if (target instanceof HTMLImageElement) {
      setCurrent({ src: target.currentSrc || target.src, alt: target.alt, diagram: false });
    } else {
      const clone = target.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const label = target.closest("figure")?.getAttribute("aria-label") ?? "Mermaid 图表";
      setCurrent({
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clone.outerHTML)}`,
        alt: label,
        diagram: true,
      });
    }
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-article-body]");
    if (!article) return;
    const articleRoot = article;

    function enhance() {
      for (const target of articleRoot.querySelectorAll<ZoomTarget>("img, .mermaid-diagram svg")) {
        if (target.closest("a")) continue;
        target.dataset.zoomable = "true";
        target.tabIndex = 0;
        target.setAttribute("role", "button");
        const label = target instanceof HTMLImageElement
          ? target.alt ? `放大图片：${target.alt}` : "放大图片"
          : "放大 Mermaid 图表";
        target.setAttribute("aria-label", label);
      }
    }

    function zoomTargetOf(event: Event) {
      return (event.target as Element | null)?.closest<ZoomTarget>(
        "img[data-zoomable], .mermaid-diagram svg[data-zoomable]",
      ) ?? null;
    }

    function handleClick(event: MouseEvent) {
      const target = zoomTargetOf(event);
      if (target) open(target);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = zoomTargetOf(event);
      if (!target) return;
      event.preventDefault();
      open(target);
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(article, { childList: true, subtree: true });
    article.addEventListener("click", handleClick);
    article.addEventListener("keydown", handleKeyDown);
    return () => {
      observer.disconnect();
      article.removeEventListener("click", handleClick);
      article.removeEventListener("keydown", handleKeyDown);
      for (const target of article.querySelectorAll<HTMLElement>("[data-zoomable]")) {
        delete target.dataset.zoomable;
        target.removeAttribute("tabindex");
        target.removeAttribute("role");
        target.removeAttribute("aria-label");
      }
    };
  }, [open]);

  useEffect(() => {
    if (!current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [current]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="图片预览"
      onClose={() => setCurrent(null)}
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      className="h-full max-h-full w-full max-w-full bg-transparent p-0 backdrop:bg-black/85 open:[animation:overlay-in_140ms_ease-out] motion-reduce:open:animate-none"
    >
      {current ? (
        <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-3 p-4 sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic original/data URI preview */}
          <img
            src={current.src}
            alt={current.alt}
            className={`pointer-events-auto max-h-[85vh] rounded-md object-contain shadow-2xl ${current.diagram ? "w-[min(94vw,90rem)] max-w-none" : "max-w-full"}`}
          />
          {current.alt ? <p className="pointer-events-auto max-w-[46rem] text-center text-sm text-white/80">{current.alt}</p> : null}
        </div>
      ) : null}
      <button type="button" aria-label="关闭图片预览" onClick={() => dialogRef.current?.close()} className="fixed right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
        <X className="size-5" />
      </button>
    </dialog>
  );
}
