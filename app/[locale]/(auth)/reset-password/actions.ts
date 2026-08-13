"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { digestActionToken } from "@/lib/auth/action-tokens";
import { extractClientIp } from "@/lib/auth/device";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/password-input";
import { isBlockedPassword } from "@/lib/auth/password-policy";
import { securityAlertPayload } from "@/lib/auth/security-alert";
import { clearRegisteredSessionCache } from "@/lib/auth/session-registry";
import { db } from "@/lib/db";
import { auditLogs, mailOutbox, userActionTokens, userSessions, users } from "@/lib/db/schema";
import { encryptOutboxPayload } from "@/lib/mail/outbox";

/** 返回字典 key 而非文案：动作不需要知道当前语言，翻译交给 UI。 */
export type ResetPasswordErrorKey =
  | "errors.passwordMismatch"
  | "errors.passwordTooCommonReset"
  | "errors.passwordSameAsCurrent"
  | "resetPassword.invalidTitle"
  | "errors.invalidEmail";

export type ResetPasswordState = { errorKey?: ResetPasswordErrorKey };

const tokenSchema = z.string().min(20).max(512);
const confirmationSchema = z.string().max(1_024);

class InvalidResetLinkError extends Error {}

export async function resetPasswordAction(
  _state: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = tokenSchema.safeParse(formData.get("token"));
  const password = passwordSchema.safeParse(formData.get("password"));
  const confirmation = confirmationSchema.safeParse(formData.get("confirmPassword"));
  if (!token.success) return invalidLink();
  if (!password.success) return { errorKey: "errors.passwordMismatch" };
  if (!confirmation.success || confirmation.data !== password.data) {
    return { errorKey: "errors.passwordMismatch" };
  }

  const requestHeaders = await headers();
  const changedAt = new Date();
  // 安全提醒邮件是中文模板，动作名跟着保持中文。
  const alertPayload = securityAlertPayload(requestHeaders, "密码已重置", changedAt);
  let revokedJtis: string[];

  try {
    revokedJtis = await db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(userActionTokens)
        .set({ consumedAt: changedAt })
        .where(and(
          eq(userActionTokens.tokenDigest, digestActionToken(token.data)),
          eq(userActionTokens.type, "reset_password"),
          isNull(userActionTokens.consumedAt),
          gt(userActionTokens.expiresAt, changedAt),
        ))
        .returning({ userId: userActionTokens.userId });
      if (!consumed) throw new InvalidResetLinkError();

      const [user] = await tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          passwordHash: users.passwordHash,
          disabledAt: users.disabledAt,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.id, consumed.userId))
        .limit(1);
      if (!user?.passwordHash || user.disabledAt || user.deletedAt) throw new InvalidResetLinkError();
      if (isBlockedPassword(password.data, { name: user.name, email: user.email })) {
        throw new PasswordPolicyError("errors.passwordTooCommonReset");
      }
      if ((await verifyPassword(password.data, user.passwordHash)).valid) {
        throw new PasswordPolicyError("errors.passwordSameAsCurrent");
      }

      const passwordHash = await hashPassword(password.data);
      const payloadEnc = encryptOutboxPayload(alertPayload);
      await tx
        .update(users)
        .set({ passwordHash, passwordChangedAt: changedAt, updatedAt: changedAt })
        .where(eq(users.id, user.id));
      const revoked = await tx
        .update(userSessions)
        .set({ revokedAt: changedAt })
        .where(and(eq(userSessions.userId, user.id), isNull(userSessions.revokedAt)))
        .returning({ jti: userSessions.jti });
      await tx
        .update(userActionTokens)
        .set({ consumedAt: changedAt })
        .where(and(
          eq(userActionTokens.userId, user.id),
          eq(userActionTokens.type, "reset_password"),
          isNull(userActionTokens.consumedAt),
        ));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "account.password.reset",
        targetType: "user",
        targetId: user.id,
        after: { revokedSessions: revoked.length },
        ip: extractClientIp(requestHeaders),
        userAgent: requestHeaders.get("user-agent")?.slice(0, 2_048) ?? null,
      });
      await tx.insert(mailOutbox).values({
        template: "security_alert",
        recipient: user.email,
        payloadEnc,
        encryptionKeyVersion: 1,
      });
      return revoked.map((row) => row.jti);
    });
  } catch (error) {
    if (error instanceof InvalidResetLinkError) return invalidLink();
    if (error instanceof PasswordPolicyError) return { errorKey: error.message as ResetPasswordErrorKey };
    throw error;
  }

  await clearRegisteredSessionCache(revokedJtis);
  // 重置成功后回登录页。locale 前缀由 proxy 的 as-needed 规则处理：
  // 中文站保持无前缀，英文用户从 /en/reset-password 过来时由中间件改写。
  redirect("/login?reset=success");
}

class PasswordPolicyError extends Error {}

function invalidLink(): ResetPasswordState {
  return { errorKey: "resetPassword.invalidTitle" };
}
