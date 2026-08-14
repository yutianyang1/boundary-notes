"use server";

import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { localePath, normalizeLocale } from "@/i18n/href";
import { createActionToken, digestActionToken } from "@/lib/auth/action-tokens";
import { extractClientIp } from "@/lib/auth/device";
import { hashPassword } from "@/lib/auth/password";
import { isBlockedPassword } from "@/lib/auth/password-policy";
import {
  allowRegistrationRequest,
  RESEND_COOLDOWN_SECONDS,
  type RegistrationGate,
} from "@/lib/auth/registration-rate-limit";
import { registrationInputSchema } from "@/lib/auth/registration-input";
import { db } from "@/lib/db";
import { auditLogs, mailOutbox, pendingRegistrations, users } from "@/lib/db/schema";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { encryptOutboxPayload } from "@/lib/mail/outbox";
import { SUPERSEDED_VERIFICATION_MAIL_ERROR } from "@/lib/mail/verification";

export type RegisterState = {
  /** sent = 展示「检查你的邮箱」卡片；error = 停留在初始表单。 */
  status?: "sent" | "error";
  /**
   * 初始表单上的错误提示，存的是 auth 命名空间下的字典 key 而非文案。
   * locale 只用于站内链接与跳转，具体提示文案仍由 UI 渲染。
   */
  messageKey?: RegisterMessageKey;
  /** 已发送卡片内的提示 key，用于重发被冷却拦下的场景。 */
  noticeKey?: RegisterMessageKey;
  emailHint?: string;
  email?: string;
  /** 距离下次可重发的秒数，驱动按钮倒计时。 */
  cooldownSeconds?: number;
  /**
   * 每次响应都换一个值。客户端拿它当 key，让输入框和倒计时按钮重新挂载，
   * 从而不必在 effect 里同步 setState。
   */
  issuedAt?: number;
};

export type RegisterMessageKey =
  | "errors.registrationClosed"
  | "errors.invalidEmail"
  | "errors.emailTaken"
  | "errors.resendCooldown"
  | "errors.sendQuotaExceeded"
  | "errors.serviceUnavailable"
  | "errors.checkInboxMessage"
  | "errors.registrationLinkInvalid"
  | "errors.registrationAlreadyDone"
  | "errors.passwordTooCommon";

export type CompleteRegistrationState = { errorKey?: RegisterMessageKey };

const emailSchema = z.email().transform((value) => value.trim().toLowerCase());

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function throttleKey(gate: Extract<RegistrationGate, { allowed: false }>): RegisterMessageKey {
  if (gate.reason === "cooldown") return "errors.resendCooldown";
  if (gate.reason === "quota") return "errors.sendQuotaExceeded";
  return "errors.serviceUnavailable";
}

export async function registerAction(previous: RegisterState, formData: FormData): Promise<RegisterState> {
  return { ...await runRegistration(previous, formData), issuedAt: Date.now() };
}

async function runRegistration(_: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!isPublicRegistrationEnabled()) return { status: "error", messageKey: "errors.registrationClosed" };
  const locale = normalizeLocale(formData.get("locale"));
  const parsed = emailSchema.safeParse(formData.get("email"));
  // 邮箱本身不合法时没有可回填的值，其余分支一律把它带回去，避免用户重输。
  if (!parsed.success) return { status: "error", messageKey: "errors.invalidEmail" };
  const emailHint = maskEmail(parsed.data);
  const isResend = formData.get("intent") === "resend";

  if (String(formData.get("website") ?? "").trim()) {
    return {
      status: "sent",
      messageKey: "errors.checkInboxMessage",
      emailHint,
      email: parsed.data,
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    };
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data)).limit(1);
  if (existing) {
    return { status: "error", messageKey: "errors.emailTaken", email: parsed.data };
  }
  const requestHeaders = await headers();
  const gate = await allowRegistrationRequest(extractClientIp(requestHeaders), parsed.data);
  if (!gate.allowed) {
    const key = throttleKey(gate);
    // 重发被拦下时保留卡片，只在卡片里提示，并按剩余时间重启倒计时。
    return isResend
      ? { status: "sent", messageKey: "errors.checkInboxMessage", noticeKey: key, emailHint, email: parsed.data, cooldownSeconds: gate.retryAfterSeconds }
      : { status: "error", messageKey: key, email: parsed.data };
  }

  const { token, tokenDigest } = createActionToken();
  const verifyUrl = new URL(localePath("/verify-email", locale), process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost");
  verifyUrl.searchParams.set("token", token);
  // 邮件模板是中文的（腾讯云 SES 模板带审核 ID），载荷跟着保持中文，不走 i18n。
  const payloadEnc = encryptOutboxPayload({ name: "读者", verifyUrl: verifyUrl.toString() });
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(mailOutbox).set({
      status: "failed",
      payloadEnc: null,
      redactedAt: now,
      lastError: SUPERSEDED_VERIFICATION_MAIL_ERROR,
    }).where(and(
      eq(mailOutbox.template, "verify_email"),
      eq(mailOutbox.recipient, parsed.data),
      eq(mailOutbox.status, "pending"),
    ));
    await tx.insert(pendingRegistrations).values({
      email: parsed.data,
      tokenDigest,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
    }).onConflictDoUpdate({
      target: pendingRegistrations.email,
      set: {
        tokenDigest,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
        verifiedAt: null,
        consumedAt: null,
        updatedAt: now,
      },
    });
    await tx.insert(mailOutbox).values({
      template: "verify_email",
      recipient: parsed.data,
      payloadEnc,
      encryptionKeyVersion: 1,
    });
  });
  return {
    status: "sent",
    messageKey: "errors.checkInboxMessage",
    emailHint,
    email: parsed.data,
    cooldownSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

export async function completeRegistrationAction(
  _state: CompleteRegistrationState,
  formData: FormData,
): Promise<CompleteRegistrationState> {
  if (!isPublicRegistrationEnabled()) return { errorKey: "errors.registrationClosed" };
  const locale = normalizeLocale(formData.get("locale"));
  const token = String(formData.get("token") ?? "");
  if (token.length < 20) return { errorKey: "errors.registrationLinkInvalid" };
  const tokenDigest = digestActionToken(token);
  const [pending] = await db.select({ email: pendingRegistrations.email }).from(pendingRegistrations).where(and(
    eq(pendingRegistrations.tokenDigest, tokenDigest),
    isNotNull(pendingRegistrations.verifiedAt),
    isNull(pendingRegistrations.consumedAt),
    gt(pendingRegistrations.expiresAt, new Date()),
  )).limit(1);
  if (!pending) return { errorKey: "errors.registrationLinkInvalid" };

  const parsed = registrationInputSchema.safeParse({
    name: formData.get("name"),
    email: pending.email,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errorKey: "errors.invalidEmail" };
  if (isBlockedPassword(parsed.data.password, { email: pending.email, name: parsed.data.name })) {
    return { errorKey: "errors.passwordTooCommon" };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const requestHeaders = await headers();
  try {
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(pendingRegistrations).set({
        consumedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(pendingRegistrations.tokenDigest, tokenDigest),
        isNotNull(pendingRegistrations.verifiedAt),
        isNull(pendingRegistrations.consumedAt),
        gt(pendingRegistrations.expiresAt, new Date()),
      )).returning({ email: pendingRegistrations.email });
      if (!claimed) throw new Error("REGISTRATION_TOKEN_INVALID");
      const [user] = await tx.insert(users).values({
        name: parsed.data.name,
        email: claimed.email,
        passwordHash,
        role: "reader",
        emailVerified: new Date(),
      }).returning({ id: users.id });
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "account.register",
        targetType: "user",
        targetId: user.id,
        ip: extractClientIp(requestHeaders),
        userAgent: requestHeaders.get("user-agent"),
      });
    });
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes("users_email_unique") || error.message === "REGISTRATION_TOKEN_INVALID"
    )) return { errorKey: "errors.registrationAlreadyDone" };
    throw error;
  }
  redirect(localePath("/login?registered=success", locale));
}
