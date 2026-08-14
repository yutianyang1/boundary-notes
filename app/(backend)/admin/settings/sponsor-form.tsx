"use client";

import { useActionState } from "react";
import { saveSponsorSlotAction, type SponsorActionState } from "./actions";
import type { SponsorSlot } from "@/lib/settings/sponsor";

const field = "mt-1.5 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-ring/30";
const label = "text-sm font-medium";
const hint = "mt-1 text-xs text-muted-foreground";

export function SponsorForm({ initial }: { initial: SponsorSlot }) {
  const [state, formAction, pending] = useActionState<SponsorActionState, FormData>(
    saveSponsorSlotAction,
    {},
  );

  return (
    <form action={formAction} className="mt-8 max-w-xl space-y-5">
      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial.enabled}
          className="size-4 rounded border accent-primary"
        />
        <span className="text-sm font-medium">在文章页展示赞助位</span>
      </label>

      <div>
        <label className={label} htmlFor="sponsor-label">小标题</label>
        <input id="sponsor-label" name="label" maxLength={12} defaultValue={initial.label} className={field} />
        <p className={hint}>显示在卡片上方的一行灰字，例如「赞助」「合作」。</p>
      </div>

      <div>
        <label className={label} htmlFor="sponsor-label-en">小标题（英文）</label>
        <input id="sponsor-label-en" name="labelEn" maxLength={12} defaultValue={initial.labelEn} className={field} />
        <p className={hint}>英文站显示。以下四个英文字段留空即沿用中文。</p>
      </div>

      <div>
        <label className={label} htmlFor="sponsor-title">标题</label>
        <input id="sponsor-title" name="title" required maxLength={60} defaultValue={initial.title} className={field} />
      </div>

      <div>
        <label className={label} htmlFor="sponsor-title-en">标题（英文）</label>
        <input id="sponsor-title-en" name="titleEn" maxLength={60} defaultValue={initial.titleEn} className={field} />
      </div>

      <div>
        <label className={label} htmlFor="sponsor-description">一句话说明</label>
        <textarea id="sponsor-description" name="description" rows={3} maxLength={160} defaultValue={initial.description} className={field} />
      </div>

      <div>
        <label className={label} htmlFor="sponsor-description-en">一句话说明（英文）</label>
        <textarea id="sponsor-description-en" name="descriptionEn" rows={3} maxLength={160} defaultValue={initial.descriptionEn} className={field} />
      </div>

      <div>
        <label className={label} htmlFor="sponsor-image">图片</label>
        <input id="sponsor-image" name="imageUrl" defaultValue={initial.imageUrl} placeholder="/media/library/xxxx.png" className={field} />
        <p className={hint}>
          只接受媒体库里的图片路径，先去媒体库上传再把地址复制过来。
          外链图片一律拒绝——赞助位不能引入第三方请求。留空则只显示文字。
        </p>
      </div>

      <div>
        <label className={label} htmlFor="sponsor-link">跳转链接</label>
        <input id="sponsor-link" name="linkUrl" required type="url" defaultValue={initial.linkUrl} placeholder="https://example.com" className={field} />
        <p className={hint}>会以 rel=&quot;sponsored&quot; 输出，不向对方传递搜索权重。</p>
      </div>

      <div>
        <label className={label} htmlFor="sponsor-cta">行动文案</label>
        <input id="sponsor-cta" name="ctaText" required maxLength={20} defaultValue={initial.ctaText} className={field} />
      </div>

      <div>
        <label className={label} htmlFor="sponsor-cta-en">行动文案（英文）</label>
        <input id="sponsor-cta-en" name="ctaTextEn" maxLength={20} defaultValue={initial.ctaTextEn} className={field} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-primary/40 bg-accent px-3 py-2 text-sm text-accent-foreground">{state.success}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
