"use server";

import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createActionToken, digestActionToken } from "@/lib/auth/action-tokens";
import { extractClientIp } from "@/lib/auth/device";
import { hashPassword } from "@/lib/auth/password";
import { isBlockedPassword } from "@/lib/auth/password-policy";
import { allowRegistrationRequest } from "@/lib/auth/registration-rate-limit";
import { registrationInputSchema } from "@/lib/auth/registration-input";
import { db } from "@/lib/db";
import { auditLogs, mailOutbox, pendingRegistrations, users } from "@/lib/db/schema";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { encryptOutboxPayload } from "@/lib/mail/outbox";

export type RegisterState = {
  status?: "success" | "error";
  message?: string;
  emailHint?: string;
  email?: string;
};

export type CompleteRegistrationState = { error?: string };

const emailSchema = z.email("请输入有效邮箱").transform((value) => value.trim().toLowerCase());
const checkInboxMessage = "验证邮件已发送，请前往邮箱完成验证。";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

export async function registerAction(_: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!isPublicRegistrationEnabled()) return { status: "error", message: "注册暂未开放。" };
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const emailHint = maskEmail(parsed.data);

  if (String(formData.get("website") ?? "").trim()) {
    return { status: "success", message: checkInboxMessage, emailHint, email: parsed.data };
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data)).limit(1);
  if (existing) {
    return { status: "error", message: "该邮箱已经注册，请直接登录。" };
  }
  const requestHeaders = await headers();
  if (!await allowRegistrationRequest(extractClientIp(requestHeaders), parsed.data)) {
    return { status: "error", message: "验证邮件发送得太频繁，请稍后再试。" };
  }

  const { token, tokenDigest } = createActionToken();
  const verifyUrl = new URL("/verify-email", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost");
  verifyUrl.searchParams.set("token", token);
  const payloadEnc = encryptOutboxPayload({ name: "读者", verifyUrl: verifyUrl.toString() });
  const now = new Date();
  await db.transaction(async (tx) => {
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
  return { status: "success", message: checkInboxMessage, emailHint, email: parsed.data };
}

export async function completeRegistrationAction(
  _state: CompleteRegistrationState,
  formData: FormData,
): Promise<CompleteRegistrationState> {
  if (!isPublicRegistrationEnabled()) return { error: "注册暂未开放。" };
  const token = String(formData.get("token") ?? "");
  if (token.length < 20) return { error: "注册链接无效或已经过期，请重新验证邮箱。" };
  const tokenDigest = digestActionToken(token);
  const [pending] = await db.select({ email: pendingRegistrations.email }).from(pendingRegistrations).where(and(
    eq(pendingRegistrations.tokenDigest, tokenDigest),
    isNotNull(pendingRegistrations.verifiedAt),
    isNull(pendingRegistrations.consumedAt),
    gt(pendingRegistrations.expiresAt, new Date()),
  )).limit(1);
  if (!pending) return { error: "注册链接无效或已经过期，请重新验证邮箱。" };

  const parsed = registrationInputSchema.safeParse({
    name: formData.get("name"),
    email: pending.email,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (isBlockedPassword(parsed.data.password, { email: pending.email, name: parsed.data.name })) {
    return { error: "该密码过于常见，或与账户信息太接近。" };
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
    )) return { error: "该邮箱已完成注册，或注册链接已经失效。" };
    throw error;
  }
  redirect("/login?registered=success");
}
