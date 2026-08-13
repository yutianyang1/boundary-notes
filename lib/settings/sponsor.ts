import { cacheLife, cacheTag } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cacheTags } from "@/lib/cache/tags";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export const SPONSOR_SETTING_KEY = "sponsor.slot";

// 图片只收站内媒体库路径:赞助位不引入任何第三方请求,
// 否则等于把跨站追踪从正门放进来,也会破坏 CSP。
const mediaPath = z.string().trim().regex(/^\/media\/[a-z]+\/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif|svg)$/i);

export const sponsorSlotSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().max(12),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(160),
  imageUrl: z.union([mediaPath, z.literal("")]),
  linkUrl: z.string().trim().url().refine(
    (value) => /^https?:\/\//i.test(value),
    "赞助链接必须是 http(s) 地址",
  ),
  ctaText: z.string().trim().min(1).max(20),
});

export type SponsorSlot = z.infer<typeof sponsorSlotSchema>;

export const emptySponsorSlot: SponsorSlot = {
  enabled: false,
  label: "赞助",
  title: "",
  description: "",
  imageUrl: "",
  linkUrl: "",
  ctaText: "了解更多",
};

/** 供后台表单回填:未配置或配置已损坏时给出空表单,不抛错。 */
export async function readSponsorSlotDraft(): Promise<SponsorSlot> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SPONSOR_SETTING_KEY))
    .limit(1);
  const parsed = sponsorSlotSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { ...emptySponsorSlot, ...(row?.value as object ?? {}) };
}

/**
 * 供前台渲染。返回 null 表示"什么都不显示"——未配置、已停用、
 * 或存量数据不再满足校验(例如图片域名规则收紧过)都走这条路,
 * 绝不把半截配置渲染出去。
 */
export async function readActiveSponsorSlot(): Promise<SponsorSlot | null> {
  "use cache";
  cacheTag(cacheTags.settings);
  cacheLife("days");

  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SPONSOR_SETTING_KEY))
    .limit(1);
  if (!row) return null;

  const parsed = sponsorSlotSchema.safeParse(row.value);
  if (!parsed.success || !parsed.data.enabled) return null;
  return parsed.data;
}
