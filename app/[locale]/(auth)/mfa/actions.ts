"use server";

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { unstable_update } from "@/auth";
import { extractClientIp } from "@/lib/auth/device";
import {
  createMfaUpgradeProof,
  decryptMfaSecret,
  generateRecoveryCodes,
  recoveryCodeDigest,
  verifyTotp,
} from "@/lib/auth/mfa";
import { allowMfaAttempt } from "@/lib/auth/mfa-rate-limit";
import { requireMfaChallenge, requireMfaEnrollment } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { auditLogs, mfaCredentials, mfaRecoveryCodes, users } from "@/lib/db/schema";

/** 返回字典 key 而非文案，翻译交给 UI。 */
export type MfaErrorKey =
  | "errors.tooManyAttempts"
  | "errors.mfaBindingExpired"
  | "errors.mfaCodeIncorrect"
  | "errors.mfaUnavailable"
  | "errors.mfaCodeOrRecoveryIncorrect";

export type MfaActionState = { errorKey?: MfaErrorKey; success?: boolean; recoveryCodes?: string[] };

function normalizedCode(formData: FormData) {
  return String(formData.get("code") ?? "").trim();
}

async function rateLimit(userId: string) {
  const requestHeaders = await headers();
  return {
    allowed: await allowMfaAttempt(userId, extractClientIp(requestHeaders)),
    requestHeaders,
  };
}

async function upgradeSession(userId: string, sessionId: string) {
  await unstable_update({ mfaUpgradeProof: createMfaUpgradeProof(userId, sessionId) } as never);
}

export async function confirmMfaEnrollmentAction(_state: MfaActionState, formData: FormData): Promise<MfaActionState> {
  const session = await requireMfaEnrollment();
  const code = normalizedCode(formData);
  const attempt = await rateLimit(session.user.id);
  if (!attempt.allowed) return { errorKey: "errors.tooManyAttempts" };

  const [credential] = await db.select().from(mfaCredentials).where(eq(mfaCredentials.userId, session.user.id)).limit(1);
  if (!credential || credential.confirmedAt) return { errorKey: "errors.mfaBindingExpired" };
  const secret = decryptMfaSecret(credential.secretEnc, credential.keyVersion);
  if (!verifyTotp(secret, code)) return { errorKey: "errors.mfaCodeIncorrect" };

  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(mfaCredentials).set({ confirmedAt: now }).where(eq(mfaCredentials.userId, session.user.id));
    await tx.update(users).set({ mfaEnabled: true, mfaRequiredAfter: null, updatedAt: now }).where(eq(users.id, session.user.id));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, session.user.id));
    await tx.insert(mfaRecoveryCodes).values(recoveryCodes.map((recoveryCode) => ({
      userId: session.user.id,
      codeHash: recoveryCodeDigest(recoveryCode),
    })));
    await tx.insert(auditLogs).values({
      actorId: session.user.id,
      action: "account.mfa.enable",
      targetType: "user",
      targetId: session.user.id,
      ip: extractClientIp(attempt.requestHeaders),
      userAgent: attempt.requestHeaders.get("user-agent"),
    });
  });
  await upgradeSession(session.user.id, session.sessionId);
  return { success: true, recoveryCodes };
}

export async function verifyMfaChallengeAction(_state: MfaActionState, formData: FormData): Promise<MfaActionState> {
  const session = await requireMfaChallenge();
  const code = normalizedCode(formData);
  const attempt = await rateLimit(session.user.id);
  if (!attempt.allowed) return { errorKey: "errors.tooManyAttempts" };

  const [credential] = await db.select().from(mfaCredentials).where(and(
    eq(mfaCredentials.userId, session.user.id),
  )).limit(1);
  if (!credential?.confirmedAt) return { errorKey: "errors.mfaUnavailable" };

  const secret = decryptMfaSecret(credential.secretEnc, credential.keyVersion);
  let method: "totp" | "recovery" | null = verifyTotp(secret, code) ? "totp" : null;
  if (!method) {
    const [used] = await db.update(mfaRecoveryCodes).set({ usedAt: new Date() }).where(and(
      eq(mfaRecoveryCodes.userId, session.user.id),
      eq(mfaRecoveryCodes.codeHash, recoveryCodeDigest(code)),
      isNull(mfaRecoveryCodes.usedAt),
    )).returning({ id: mfaRecoveryCodes.id });
    if (used) method = "recovery";
  }
  if (!method) return { errorKey: "errors.mfaCodeOrRecoveryIncorrect" };

  await db.insert(auditLogs).values({
    actorId: session.user.id,
    action: "account.mfa.verify",
    targetType: "user_session",
    targetId: session.sessionId,
    after: { method },
    ip: extractClientIp(attempt.requestHeaders),
    userAgent: attempt.requestHeaders.get("user-agent"),
  });
  await upgradeSession(session.user.id, session.sessionId);
  return { success: true };
}
