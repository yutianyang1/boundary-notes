"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export function CoverUploader({
  initialUrl,
  altText = "当前文章封面",
}: {
  initialUrl?: string | null;
  altText?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.set("cover", file);

    try {
      const response = await fetch("/api/admin/posts/cover", { method: "POST", body: formData });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "封面上传失败。");
      setUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "封面上传失败。");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="cover" value={url} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {url ? (
          <Image
            src={url}
            alt={altText}
            width={240}
            height={135}
            unoptimized
            className="aspect-video w-full rounded-md border object-cover sm:w-60"
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-md border border-dashed bg-muted text-sm text-muted-foreground sm:w-60">
            暂无封面
          </div>
        )}
        <div>
          <label className="inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm font-semibold hover:bg-muted">
            {uploading ? "正在上传…" : url ? "更换封面" : "上传封面"}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/svg+xml"
              disabled={uploading}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          {url ? (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="ml-3 text-sm text-muted-foreground hover:text-foreground"
            >
              移除
            </button>
          ) : null}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            JPEG、PNG、WebP、AVIF、HEIC 或 SVG，最大 8 MB；建议使用 16:9 横图。
          </p>
          {error ? <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
