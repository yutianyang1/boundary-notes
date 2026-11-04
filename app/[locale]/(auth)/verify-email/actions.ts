"use server";

import { redirect } from "next/navigation";
import { localePath, normalizeLocale } from "@/i18n/href";
import { verifyEmailToken } from "@/lib/auth/email-verification";
import { isPublicRegistrationEnabled } from "@/lib/features";

export async function verifyEmailAction(formData: FormData) {
  if (!isPublicRegistrationEnabled()) return;
  const locale = normalizeLocale(formData.get("locale"));
  const token = String(formData.get("token") ?? "");
  if (token.length < 20) return;
  const result = await verifyEmailToken(token);
  if (result.status === "closed") return;
  if (result.status === "pending") redirect(localePath(`/register/complete?token=${encodeURIComponent(token)}`, locale));
  if (result.status === "legacy") redirect(localePath("/login?verified=success", locale));
  redirect(localePath("/register?verification=invalid", locale));
}
