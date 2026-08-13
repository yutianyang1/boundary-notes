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

export type AccountActionState = {
  error?: string;
  success?: string;
};

const nameSchema = z.string().trim().min(1, "昵称不能为空。").max(120, "昵称不能超过 120 个字符。");

export async function updateProfileAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireFullSession();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

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
  return { success: "资料已更新。" };
}

export async function changePasswordAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireFullSession();
  const currentPassword = z.string().min(1).max(1_024).safeParse(formData.get("currentPassword"));
  const newPassword = passwordSchema.safeParse(formData.get("newPassword"));
  const confirmation = z.string().safeParse(formData.get("confirmPassword"));
  if (!currentPassword.success) return { error: "请输入当前密码。" };
  if (!newPassword.success) return { error: newPassword.error.issues[0]?.message };
  if (!confirmation.success || confirmation.data !== newPassword.data) {
    return { error: "两次输入的新密码不一致。" };
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
  if (!user?.passwordHash) return { error: "当前账户没有可修改的密码凭据。" };

  const currentResult = await verifyPassword(currentPassword.data, user.passwordHash);
  if (!currentResult.valid) return { error: "当前密码不正确。" };
  if ((await verifyPassword(newPassword.data, user.passwordHash)).valid) {
    return { error: "新密码不能与当前密码相同。" };
  }
  if (isBlockedPassword(newPassword.data, { name: user.name, email: user.email })) {
    return { error: "这个密码过于常见，或与账户资料过于接近。" };
  }

  const passwordHash = await hashPassword(newPassword.data);
  const changedAt = new Date();
  const requestHeaders = await headers();
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
    success: `密码已更新${revokedJtis.length ? `，并退出了 ${revokedJtis.length} 个其他设备` : ""}。`,
  };
}

export async function revokeDeviceAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireFullSession();
  const parsed = z.string().uuid().safeParse(formData.get("sessionId"));
  if (!parsed.success) return { error: "会话标识无效。" };
  if (parsed.data === session.sessionId) return { error: "不能在这里下线当前设备。" };

  const revoked = await revokeUserSession(session.user.id, parsed.data);
  if (!revoked) return { error: "该会话不存在或已经失效。" };
  await db.insert(auditLogs).values({
    actorId: session.user.id,
    action: "account.session.revoke",
    targetType: "user_session",
    targetId: parsed.data,
  });
  revalidatePath("/account");
  return { success: "设备已下线。" };
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
  return { success: count ? `已退出 ${count} 个其他设备。` : "没有其他登录设备。" };
}
