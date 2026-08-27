"use client";

import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type ZoomedImage = { src: string; alt: string; diagram: boolean };
type ZoomTarget = HTMLImageElement | SVGSVGElement;
type ViewState = { scale: number; x: number; y: number };
type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number };

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;
const INITIAL_VIEW: ViewState = { scale: MIN_SCALE, x: 0, y: 0 };

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function ImageLightbox() {
  const t = useTranslations("post");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressImageClickRef = useRef(false);
  const [current, setCurrent] = useState<ZoomedImage | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);

  const resetView = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    setView(INITIAL_VIEW);
  }, []);

  const open = useCallback((target: ZoomTarget) => {
    resetView();
    if (target instanceof HTMLImageElement) {
      setCurrent({ src: target.currentSrc || target.src, alt: target.alt, diagram: false });
    } else {
      const clone = target.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const label = target.closest("figure")?.getAttribute("aria-label") ?? t("diagram");
      setCurrent({
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clone.outerHTML)}`,
        alt: label,
        diagram: true,
      });
    }
    dialogRef.current?.showModal();
  }, [resetView, t]);

  const setScaleAt = useCallback((requestedScale: number, clientX?: number, clientY?: number) => {
    setView((previous) => {
      const scale = clampScale(requestedScale);
      if (scale === previous.scale) return previous;
      if (scale === MIN_SCALE) return INITIAL_VIEW;

      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage || clientX === undefined || clientY === undefined) {
        return { ...previous, scale };
      }

      const focusX = clientX - (stage.left + stage.width / 2);
      const focusY = clientY - (stage.top + stage.height / 2);
      const ratio = scale / previous.scale;
      return {
        scale,
        x: focusX - (focusX - previous.x) * ratio,
        y: focusY - (focusY - previous.y) * ratio,
      };
    });
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
          ? target.alt ? t("zoomImageNamed", { alt: target.alt }) : t("zoomImage")
          : t("zoomDiagram");
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
  }, [open, t]);

  useEffect(() => {
    if (!current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [current]);

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setScaleAt(view.scale + direction, event.clientX, event.clientY);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    suppressImageClickRef.current = false;
    if (view.scale === MIN_SCALE || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      suppressImageClickRef.current = true;
    }
    setView((previous) => ({
      ...previous,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }

  function stopDragging(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={t("imagePreview")}
      onClose={() => { setCurrent(null); resetView(); }}
      className="h-full max-h-full w-full max-w-full overflow-hidden bg-transparent p-0 backdrop:bg-black/90 open:[animation:overlay-in_140ms_ease-out] motion-reduce:open:animate-none"
    >
      <div
        ref={stageRef}
        className="relative grid h-full w-full touch-none place-items-center overflow-hidden p-4 pb-24 pt-20 sm:p-10 sm:pb-24 sm:pt-20"
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
        onWheel={handleWheel}
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic original/data URI preview
          <img
            src={current.src}
            alt={current.alt}
            title={t("closeImagePreview")}
            draggable={false}
            onClick={() => {
              if (suppressImageClickRef.current) {
                suppressImageClickRef.current = false;
                return;
              }
              dialogRef.current?.close();
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            className={`max-h-[calc(100dvh-10rem)] max-w-[calc(100vw-2rem)] select-none rounded-lg object-contain shadow-2xl will-change-transform sm:max-w-[calc(100vw-5rem)] ${
              view.scale > MIN_SCALE ? dragging ? "cursor-grabbing" : "cursor-grab" : "cursor-zoom-out"
            } ${current.diagram ? "bg-white/95 p-2 sm:p-4" : ""}`}
            style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
          />
        ) : null}

        {current?.alt ? (
          <p className="pointer-events-none fixed inset-x-4 bottom-5 z-10 mx-auto max-w-[46rem] truncate text-center text-xs text-white/70 sm:bottom-6 sm:text-sm">
            {current.alt}
          </p>
        ) : null}
      </div>

      <div className="fixed left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/55 p-1 text-white shadow-xl backdrop-blur-md sm:top-5">
        <button type="button" aria-label={t("zoomOutImage")} disabled={view.scale <= MIN_SCALE} onClick={() => setScaleAt(view.scale - SCALE_STEP)} className="grid size-9 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <Minus className="size-4" />
        </button>
        <button type="button" aria-label={t("resetImageZoom")} disabled={view.scale === MIN_SCALE && view.x === 0 && view.y === 0} onClick={resetView} className="flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-full px-2 text-xs tabular-nums transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <RotateCcw className="size-3.5" />
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" aria-label={t("zoomInImage")} disabled={view.scale >= MAX_SCALE} onClick={() => setScaleAt(view.scale + SCALE_STEP)} className="grid size-9 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <Plus className="size-4" />
        </button>
      </div>

      <button type="button" aria-label={t("closeImagePreview")} onClick={() => dialogRef.current?.close()} className="fixed right-4 top-4 z-20 grid size-11 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-xl backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:right-5 sm:top-5">
        <X className="size-5" />
      </button>
    </dialog>
  );
}
