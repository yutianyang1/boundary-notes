"use client";

import { useEffect, useRef } from "react";

export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const article = document.querySelector<HTMLElement>("[data-article-body]");
      const bar = barRef.current;
      if (!article || !bar) return;
      const start = article.offsetTop;
      const distance = Math.max(article.offsetHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
      bar.style.width = `${progress * 100}%`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden className="fixed inset-x-0 top-16 z-50 h-[3px] bg-transparent">
      <div
        ref={barRef}
        className="h-full [background:linear-gradient(90deg,var(--primary),var(--warm))] [background-size:100vw_100%] bg-no-repeat motion-reduce:transition-none"
      />
    </div>
  );
}
