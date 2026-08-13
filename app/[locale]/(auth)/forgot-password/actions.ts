"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { createActionToken } from "@/lib/auth/action-tokens";
import { extractClientIp } from "@/lib/auth/device";
import { allowPasswordResetRequest } from "@/lib/auth/password-reset-rate-limit";
import { isPasswordResetEligible, PASSWORD_RESET_RESPONSE } from "@/lib/auth/password-reset";
import { db } from "@/lib/db";
import { mailOutbox, userActionTokens, users } from "@/lib/db/schema";
import { encryptOutboxPayload } from "@/lib/mail/outbox";

export type ForgotPasswordState = { status?: "success" | "error"; message?: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("请输入有效邮箱"));

export async function forgotPasswordAction(
  _state: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const requestHeaders = await headers();
  const allowed = await allowPasswordResetRequest(extractClientIp(requestHeaders), parsed.data);
  if (!allowed) return uniformResponse();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      disabledAt: users.disabledAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.email, parsed.data))
    .limit(1);
  if (!isPasswordResetEligible(user)) return uniformResponse();

  const now = new Date();
  const { token, tokenDigest } = createActionToken();
  const resetUrl = new URL("/reset-password", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost");
  resetUrl.searchParams.set("token", token);
  const payloadEnc = encryptOutboxPayload({ resetUrl: resetUrl.toString() });

  await db.transaction(async (tx) => {
    // Serialize concurrent requests for the same account so the newest token is the only live token.
    await tx.execute(sql`select id from users where id = ${user.id} for update`);
    await tx
      .update(userActionTokens)
      .set({ consumedAt: now })
      .where(and(
        eq(userActionTokens.userId, user.id),
        eq(userActionTokens.type, "reset_password"),
        isNull(userActionTokens.consumedAt),
      ));
    await tx.insert(userActionTokens).values({
      userId: user.id,
      type: "reset_password",
      tokenDigest,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
    });
    await tx.insert(mailOutbox).values({
      template: "password_reset",
      recipient: user.email,
      payloadEnc,
      encryptionKeyVersion: 1,
    });
  });

  return uniformResponse();
}

function uniformResponse(): ForgotPasswordState {
  return { status: "success", message: PASSWORD_RESET_RESPONSE };
}
