"use client";

import { basicSetup, EditorView } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { renderMarkdownPreview } from "@/app/(backend)/admin/posts/actions";
import { MediaLibrary, type MediaAsset } from "@/components/admin/media-library";

export function MarkdownEditor({ initialValue }: { initialValue: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /**
   * 主题放进 Compartment 热替换。
   * 早前的实现把 resolvedTheme 放进 useEffect 依赖并用 doc: initialValue 重建编辑器，
   * 写作途中切换主题会把正文重置回初始值 —— 直接丢稿。
   */
  const themeCompartment = useRef(new Compartment());
  const { resolvedTheme } = useTheme();
  const [value, setValue] = useState(initialValue);
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);

  function insertMedia(_asset: MediaAsset, markdown: string) {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const before = selection.from > 0 ? view.state.doc.sliceString(selection.from - 1, selection.from) : "";
    const after = selection.to < view.state.doc.length ? view.state.doc.sliceString(selection.to, selection.to + 1) : "";
    const insertion = `${before && before !== "\n" ? "\n\n" : ""}${markdown}${after && after !== "\n" ? "\n\n" : ""}`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertion },
      selection: { anchor: selection.from + insertion.length },
      scrollIntoView: true,
    });
    view.focus();
    setMediaOpen(false);
  }

  // 只在挂载时创建一次，主题变化不参与
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: initialValue,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px", backgroundColor: "transparent" },
          ".cm-content": { padding: "1rem", fontFamily: "var(--font-mono)" },
          ".cm-scroller": { overflow: "auto" },
          "&.cm-focused": { outline: "none" },
        }),
        themeCompartment.current.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setValue(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialValue]);

  // 主题切换只重配 Compartment，文档内容和光标位置都保留
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(resolvedTheme === "dark" ? oneDark : []),
    });
  }, [resolvedTheme]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const html = await renderMarkdownPreview(value);
        if (!cancelled) {
          setPreview(html);
          setPreviewError("");
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : "预览渲染失败");
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  return (
    /* 高度锁定到剩余视口，两栏各自内部滚动，避免整页滚动 */
    <div className="grid min-h-[26rem] overflow-hidden rounded-lg border lg:h-[calc(100vh-21rem)] lg:grid-cols-2">
      <div className="flex min-h-0 min-w-0 flex-col border-b bg-background lg:border-r lg:border-b-0">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-xs font-medium tracking-wider text-muted-foreground">
          <span>MARKDOWN</span>
          <button
            type="button"
            onClick={() => setMediaOpen(true)}
            className="rounded-md border px-2.5 py-1 text-xs font-semibold normal-case tracking-normal text-foreground hover:bg-muted"
          >
            插入图片
          </button>
        </div>
        <div ref={hostRef} className="min-h-[22rem] flex-1 overflow-hidden lg:min-h-0" />
        <input type="hidden" name="contentMd" value={value} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col bg-card">
        <div className="shrink-0 border-b px-4 py-2 text-xs font-medium tracking-wider text-muted-foreground">
          预览
        </div>
        {previewError ? (
          <p role="alert" className="m-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {previewError}
          </p>
        ) : (
          <div
            className="article-body prose prose-zinc min-h-0 max-w-none flex-1 overflow-y-auto p-6 dark:prose-invert prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
      </div>
      {mediaOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="选择媒体图片"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/55 p-4 backdrop-blur-sm sm:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMediaOpen(false);
          }}
        >
          <div className="mx-auto max-w-6xl rounded-xl border bg-background p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="headline-sm text-xl">插入图片</h2>
                <p className="mt-1 text-sm text-muted-foreground">选择图片后会在当前光标位置插入 Markdown。</p>
              </div>
              <button type="button" onClick={() => setMediaOpen(false)} className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-muted">
                关闭
              </button>
            </div>
            <MediaLibrary onSelect={insertMedia} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
