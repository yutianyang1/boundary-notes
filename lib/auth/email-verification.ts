import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { digestActionToken } from "@/lib/auth/action-tokens";
import { db } from "@/lib/db";
import { pendingRegistrations, userActionTokens, users } from "@/lib/db/schema";
import { isPublicRegistrationEnabled } from "@/lib/features";

export async function verifyEmailToken(token: string) {
  if (!isPublicRegistrationEnabled()) return { status: "closed" as const };
  if (token.length < 20 || token.length > 256) return { status: "invalid" as const };
  const digest = digestActionToken(token);
  return db.transaction(async (tx) => {
    const [pending] = await tx.update(pendingRegistrations).set({ verifiedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(pendingRegistrations.tokenDigest, digest), isNull(pendingRegistrations.consumedAt), gt(pendingRegistrations.expiresAt, new Date()),
    )).returning({ email: pendingRegistrations.email });
    if (pending) return { status: "pending" as const, email: pending.email };
    const [consumed] = await tx.update(userActionTokens).set({ consumedAt: new Date() }).where(and(
      eq(userActionTokens.tokenDigest, digest), eq(userActionTokens.type, "verify_email"), isNull(userActionTokens.consumedAt), gt(userActionTokens.expiresAt, new Date()),
    )).returning({ userId: userActionTokens.userId });
    if (!consumed) return { status: "invalid" as const };
    await tx.update(users).set({ emailVerified: new Date(), updatedAt: new Date() }).where(eq(users.id, consumed.userId));
    return { status: "legacy" as const };
  });
}
