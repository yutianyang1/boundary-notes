"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/password-input";
import { isBlockedPassword } from "@/lib/auth/password-policy";
import { requireFullSession } from "@/lib/auth/permissions";
import { securityAlertPayload } from "@/lib/auth/security-alert";
import {
  clearRegisteredSessionCache,
  invalidateUserSessionCache,
  revokeOtherUserSessions,
  revokeUserSession,
} from "@/lib/auth/session-registry";
import { db } from "@/lib/db";
import { auditLogs, mailOutbox, userSessions, users } from "@/lib/db/schema";
import { encryptOutboxPayload } from "@/lib/mail/outbox";

/** 返回字典 key 而非文案，翻译交给 UI。 */
export type AccountErrorKey =
  | "errors.nameEmpty"
  | "errors.nameTooLong"
  | "errors.avatarMissing"
  | "errors.avatarFailed"
  | "errors.avatarFailedRetry"
  | "errors.currentPasswordRequired"
  | "errors.currentPasswordWrong"
  | "errors.noPasswordCredential"
  | "errors.passwordMismatch"
  | "errors.passwordSameAsCurrent"
  | "errors.passwordTooCommon"
  | "errors.passwordTooShort"
  | "errors.sessionInvalid"
  | "errors.sessionMissing"
  | "errors.cannotSignOutCurrent";

export type AccountSuccessKey =
  | "profileUpdated"
  | "avatarUpdated"
  | "passwordChanged"
  | "deviceSignedOut"
  | "signedOutOthers"
  | "passwordUpdated"
  | "noOtherDevices";

export type AccountActionState = {
  errorKey?: AccountErrorKey;
  successKey?: AccountSuccessKey;
  /** signedOutOthers 的插值。 */
  count?: number;
};

// 空与超长由调用处分开判断，schema 不产出文案。
const nameSchema = z.string().trim().min(1).max(120);

export async function updateProfileAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireFullSession();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    // 空与超长分开判断，schema 不再承担文案。
    const raw = String(formData.get("name") ?? "").trim();
    return { errorKey: raw.length === 0 ? "errors.nameEmpty" : "errors.nameTooLong" };
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      name: parsed.data,
      updatedAt: new Date(),
    }).where(eq(users.id, session.user.id));
    await tx.insert(auditLogs).values({
      actorId: session.user.id,
      action: "account.profile.update",
      targetType: "user",
      targetId: session.user.id,
      after: { name: parsed.data },
    });
  });

  await invalidateUserSessionCache(session.user.id);
  revalidatePath("/account");
  return { successKey: "profileUpdated" };
}

export async function changePasswordAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireFullSession();
  const currentPassword = z.string().min(1).max(1_024).safeParse(formData.get("currentPassword"));
  const newPassword = passwordSchema.safeParse(formData.get("newPassword"));
  const confirmation = z.string().safeParse(formData.get("confirmPassword"));
  if (!currentPassword.success) return { errorKey: "errors.currentPasswordRequired" };
  if (!newPassword.success) return { errorKey: "errors.passwordTooShort" };
  if (!confirmation.success || confirmation.data !== newPassword.data) {
    return { errorKey: "errors.passwordMismatch" };
  }

  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user?.passwordHash) return { errorKey: "errors.noPasswordCredential" };

  const currentResult = await verifyPassword(currentPassword.data, user.passwordHash);
  if (!currentResult.valid) return { errorKey: "errors.currentPasswordWrong" };
  if ((await verifyPassword(newPassword.data, user.passwordHash)).valid) {
    return { errorKey: "errors.passwordSameAsCurrent" };
  }
  if (isBlockedPassword(newPassword.data, { name: user.name, email: user.email })) {
    return { errorKey: "errors.passwordTooCommon" };
  }

  const passwordHash = await hashPassword(newPassword.data);
  const changedAt = new Date();
  const requestHeaders = await headers();
  // 安全提醒邮件是中文模板，动作名跟着保持中文。
  const payloadEnc = encryptOutboxPayload(securityAlertPayload(requestHeaders, "密码已修改", changedAt));
  const revokedJtis = await db.transaction(async (tx) => {
    await tx.update(users).set({
      passwordHash,
      passwordChangedAt: changedAt,
      updatedAt: changedAt,
    }).where(eq(users.id, session.user.id));
    const revoked = await tx
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(userSessions.userId, session.user.id),
        ne(userSessions.jti, session.sessionId),
        isNull(userSessions.revokedAt),
      ))
      .returning({ jti: userSessions.jti });
    await tx.insert(auditLogs).values({
      actorId: session.user.id,
      action: "account.password.change",
      targetType: "user",
      targetId: session.user.id,
      after: { revokedOtherSessions: revoked.length },
    });
    await tx.insert(mailOutbox).values({
      template: "security_alert",
      recipient: user.email,
      payloadEnc,
      encryptionKeyVersion: 1,
    });
    return revoked.map((row) => row.jti);
  });
  await clearRegisteredSessionCache(revokedJtis);

  revalidatePath("/account");
  return {
    successKey: "passwordUpdated",
    count: revokedJtis.length,
  };
}

export async function revokeDeviceAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireFullSession();
  const parsed = z.string().uuid().safeParse(formData.get("sessionId"));
  if (!parsed.success) return { errorKey: "errors.sessionInvalid" };
  if (parsed.data === session.sessionId) return { errorKey: "errors.cannotSignOutCurrent" };

  const revoked = await revokeUserSession(session.user.id, parsed.data);
  if (!revoked) return { errorKey: "errors.sessionMissing" };
  await db.insert(auditLogs).values({
    actorId: session.user.id,
    action: "account.session.revoke",
    targetType: "user_session",
    targetId: parsed.data,
  });
  revalidatePath("/account");
  return { successKey: "deviceSignedOut" };
}

export async function revokeOtherDevicesAction(
  _state: AccountActionState,
  _formData: FormData,
): Promise<AccountActionState> {
  void _state;
  void _formData;
  const session = await requireFullSession();
  const count = await revokeOtherUserSessions(session.user.id, session.sessionId);
  await db.insert(auditLogs).values({
    actorId: session.user.id,
    action: "account.sessions.revoke_others",
    targetType: "user",
    targetId: session.user.id,
    after: { revokedSessions: count },
  });
  revalidatePath("/account");
  return count ? { successKey: "signedOutOthers", count } : { successKey: "noOtherDevices" };
}
