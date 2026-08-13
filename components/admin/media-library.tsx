"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export type MediaAsset = {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  title: string | null;
  alt: string | null;
  uploadedBy: string;
  uploaderName: string | null;
  createdAt: string;
};

type MediaResponse = {
  items: MediaAsset[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function markdownFor(asset: MediaAsset) {
  const alt = (asset.alt ?? "").replaceAll("[", "\\[").replaceAll("]", "\\]");
  return `![${alt}](${asset.url})`;
}

export function MediaLibrary({
  onSelect,
}: {
  onSelect?: (asset: MediaAsset, markdown: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/media?page=${targetPage}&pageSize=24`, {
        cache: "no-store",
      });
      const result = await response.json() as MediaResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "媒体库加载失败。");
      setItems(result.items);
      setTotal(result.pagination.total);
      setPage(result.pagination.page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "媒体库加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(files: FileList | File[]) {
    const imageFiles = Array.from(files);
    if (!imageFiles.length) return;

    setUploading(true);
    setError("");
    setNotice("");
    const failures: string[] = [];
    let succeeded = 0;

    for (const file of imageFiles) {
      const formData = new FormData();
      formData.set("file", file);
      try {
        const response = await fetch("/api/admin/media", { method: "POST", body: formData });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "上传失败。");
        succeeded += 1;
      } catch (cause) {
        failures.push(`${file.name}：${cause instanceof Error ? cause.message : "上传失败。"}`);
      }
    }

    if (failures.length) setError(failures.join("\n"));
    if (succeeded) {
      setNotice(`已上传 ${succeeded} 张图片。`);
      await load(1);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label}已复制。`);
      setError("");
    } catch {
      setError("浏览器未允许访问剪贴板，请手动复制。");
    }
  }

  async function remove(asset: MediaAsset) {
    if (!window.confirm(`从媒体库移除 ${asset.filename}？已发布文章中的图片仍会保留。`)) return;
    const response = await fetch(`/api/admin/media/${asset.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "删除失败。");
      return;
    }
    setNotice("已从媒体库移除，物理文件仍保留。");
    await load(items.length === 1 && page > 1 ? page - 1 : page);
  }

  async function updateMetadata(asset: MediaAsset, altValue: string, titleValue: string) {
    const response = await fetch(`/api/admin/media/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alt: altValue,
        title: titleValue,
      }),
    });
    const result = await response.json() as { error?: string; alt?: string | null; title?: string | null };
    if (!response.ok) {
      setError(result.error ?? "保存失败。");
      return;
    }
    setItems((current) => current.map((item) => (
      item.id === asset.id ? { ...item, alt: result.alt ?? null, title: result.title ?? null } : item
    )));
    setNotice("图片信息已保存。");
  }

  const totalPages = Math.max(1, Math.ceil(total / 24));

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files);
        }}
        className={`grid w-full place-items-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50"
        }`}
      >
        <span className="font-semibold">{uploading ? "正在上传…" : "拖拽图片到这里，或点击选择"}</span>
        <span className="mt-2 text-xs text-muted-foreground">
          支持多选；JPEG、PNG、WebP、AVIF、GIF、HEIC、SVG；单张不超过 8 MB、最长边不超过 6000px
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif,image/svg+xml"
        multiple
        disabled={uploading}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void upload(event.target.files);
        }}
      />

      {error ? (
        <p role="alert" className="mt-4 whitespace-pre-line rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm text-primary">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-lg border bg-card">
              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(asset, markdownFor(asset))}
                className="group relative block aspect-[4/3] w-full overflow-hidden bg-muted disabled:cursor-default"
                aria-label={onSelect ? `插入图片：${asset.alt || asset.filename}` : undefined}
              >
                <Image
                  src={asset.url}
                  alt={asset.alt || ""}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                  unoptimized
                  loading="lazy"
                  className="object-contain transition-transform group-enabled:group-hover:scale-[1.02]"
                />
                {onSelect ? (
                  <span className="absolute inset-x-3 bottom-3 rounded-md bg-foreground/85 px-3 py-2 text-xs font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    插入到光标处
                  </span>
                ) : null}
              </button>
              <div className="space-y-3 p-4">
                <div>
                  <p className="truncate font-mono text-xs" title={asset.filename}>{asset.filename}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {asset.width} × {asset.height} · {formatBytes(asset.byteSize)}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {asset.uploaderName ?? "未知用户"} · {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(asset.createdAt))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void copy(markdownFor(asset), "Markdown")} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">
                    复制 Markdown
                  </button>
                  <button type="button" onClick={() => void copy(asset.url, "URL")} className="rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                    复制 URL
                  </button>
                  <button type="button" onClick={() => void remove(asset)} className="rounded-md border px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
                    删除
                  </button>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                    编辑说明文字
                  </summary>
                  <MediaMetadataEditor
                    asset={asset}
                    onSave={(alt, title) => updateMetadata(asset, alt, title)}
                  />
                </details>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          媒体库还是空的，上传第一张正文图片吧。
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button type="button" disabled={page <= 1 || loading} onClick={() => void load(page - 1)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-40">
            上一页
          </button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-40">
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MediaMetadataEditor({
  asset,
  onSave,
}: {
  asset: MediaAsset;
  onSave: (alt: string, title: string) => Promise<void>;
}) {
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [title, setTitle] = useState(asset.title ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs">
        Alt（建议填写）
        <input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={500} className="mt-1 h-9 w-full rounded-md border bg-background px-2" />
      </label>
      <label className="block text-xs">
        标题
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} className="mt-1 h-9 w-full rounded-md border bg-background px-2" />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSave(alt, title);
          setSaving(false);
        }}
        className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
