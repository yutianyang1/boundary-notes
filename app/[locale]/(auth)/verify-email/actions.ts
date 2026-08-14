"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { localePath, normalizeLocale } from "@/i18n/href";
import { digestActionToken } from "@/lib/auth/action-tokens";
import { db } from "@/lib/db";
import { pendingRegistrations, userActionTokens, users } from "@/lib/db/schema";
import { isPublicRegistrationEnabled } from "@/lib/features";

export async function verifyEmailAction(formData: FormData) {
  if (!isPublicRegistrationEnabled()) return;
  const locale = normalizeLocale(formData.get("locale"));
  const token = String(formData.get("token") ?? "");
  if (token.length < 20) return;
  const digest = digestActionToken(token);
  const result = await db.transaction(async (tx) => {
    const [pending] = await tx.update(pendingRegistrations).set({
      verifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(pendingRegistrations.tokenDigest, digest),
      isNull(pendingRegistrations.consumedAt),
      gt(pendingRegistrations.expiresAt, new Date()),
    )).returning({ id: pendingRegistrations.id });
    if (pending) return "pending" as const;

    // Compatibility for verification links issued by the previous registration flow.
    const [consumed] = await tx.update(userActionTokens).set({ consumedAt: new Date() }).where(and(
      eq(userActionTokens.tokenDigest, digest),
      eq(userActionTokens.type, "verify_email"),
      isNull(userActionTokens.consumedAt),
      gt(userActionTokens.expiresAt, new Date()),
    )).returning({ userId: userActionTokens.userId });
    if (!consumed) return "invalid" as const;
    await tx.update(users).set({ emailVerified: new Date(), updatedAt: new Date() }).where(eq(users.id, consumed.userId));
    return "legacy" as const;
  });
  if (result === "pending") redirect(localePath(`/register/complete?token=${encodeURIComponent(token)}`, locale));
  if (result === "legacy") redirect(localePath("/login?verified=success", locale));
  redirect(localePath("/register?verification=invalid", locale));
}
