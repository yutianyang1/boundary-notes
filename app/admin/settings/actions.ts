"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { cacheTags } from "@/lib/cache/tags";
import { db } from "@/lib/db";
import { auditLogs, settings } from "@/lib/db/schema";
import { SPONSOR_SETTING_KEY, sponsorSlotSchema } from "@/lib/settings/sponsor";

export type SponsorActionState = { error?: string; success?: string };

export async function saveSponsorSlotAction(
  _state: SponsorActionState,
  formData: FormData,
): Promise<SponsorActionState> {
  // 站点配置属于全站资产,只给 admin,editor 也不行。
  const user = await requireAdmin();

  const parsed = sponsorSlotSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    label: String(formData.get("label") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? "").trim(),
    linkUrl: String(formData.get("linkUrl") ?? ""),
    ctaText: String(formData.get("ctaText") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "赞助位配置不合法。" };
  }

  await db.transaction(async (tx) => {
    await tx.insert(settings).values({
      key: SPONSOR_SETTING_KEY,
      settingGroup: "sponsor",
      value: parsed.data,
      valueType: "json",
      description: "文章页侧栏赞助位",
      updatedBy: user.id,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: settings.key,
      set: {
        value: parsed.data,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "settings.sponsor.update",
      targetType: "setting",
      targetId: SPONSOR_SETTING_KEY,
      after: { enabled: parsed.data.enabled, title: parsed.data.title },
    });
  });

  updateTag(cacheTags.settings);
  revalidatePath("/admin/settings");

  return {
    success: parsed.data.enabled ? "赞助位已保存并展示。" : "赞助位已保存，当前为停用状态。",
  };
}
