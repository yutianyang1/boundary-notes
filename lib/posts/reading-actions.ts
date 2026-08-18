"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { buildSeriesPostIdsQuery } from "@/lib/posts/queries";
import { forgetPosts } from "@/lib/posts/read-progress";

const slugSchema = z.string().trim().min(1).max(240);

/**
 * 重置某个系列的阅读进度。只清当前用户在这个系列里的记录——
 * 一个按钮清光全站记录的话,谁都不敢点。
 */
export async function resetSeriesProgressAction(seriesSlug: string) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return;
  }
  const parsed = slugSchema.safeParse(seriesSlug);
  if (!parsed.success) return;

  const rows = await buildSeriesPostIdsQuery(parsed.data);
  await forgetPosts(user.id, rows.map((row) => row.id));
}
