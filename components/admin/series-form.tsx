"use client";

import { useActionState, useState } from "react";
import { saveSeriesAction, type SeriesActionState } from "@/app/(backend)/admin/series/actions";
import { CoverUploader } from "@/components/admin/cover-uploader";
import { normalizeSlug } from "@/lib/posts/slug";

type EditableSeries = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  cover?: string | null;
};

const initialState: SeriesActionState = {};
const fieldClass =
  "mt-2 h-10 w-full rounded-md border bg-background px-3 outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30";

export function SeriesForm({ series }: { series?: EditableSeries }) {
  const [state, action, pending] = useActionState(saveSeriesAction, initialState);
  const [name, setName] = useState(series?.name ?? "");
  const [slug, setSlug] = useState(series?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(series?.slug));
  const effectiveSlug = slugTouched ? slug : normalizeSlug(name);

  return (
    <form action={action} className="space-y-6">
      {series?.id ? <input type="hidden" name="id" value={series.id} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">
          系列名称
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Slug
          <input
            name="slug"
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            maxLength={180}
            className={`${fieldClass} font-mono`}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          系列描述
          <textarea
            name="description"
            defaultValue={series?.description ?? ""}
            maxLength={5000}
            rows={5}
            className="mt-2 w-full rounded-md border bg-background p-3 outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>
        <CoverUploader initialUrl={series?.cover} altText="当前系列封面" />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <button
        disabled={pending}
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "正在保存…" : series?.id ? "保存系列" : "创建系列"}
      </button>
    </form>
  );
}
