"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFullSession } from "@/lib/auth/permissions";
import {
  invalidateUserSessionCache,
  revokeOtherUserSessions,
  revokeUserSession,
} from "@/lib/auth/session-registry";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";

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
