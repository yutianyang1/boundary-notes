import { and, eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { mailOutbox, pendingRegistrations } from "@/lib/db/schema";
import { type ClaimedMail, normalizeMail } from "@/lib/mail/message";
import { getMailSender, MailSenderError } from "@/lib/mail/sender";
import {
  isCurrentPendingVerificationMail,
  SUPERSEDED_VERIFICATION_MAIL_ERROR,
} from "@/lib/mail/verification";

export { normalizeMail, renderMail } from "@/lib/mail/message";

export function safeError(error: unknown) {
  const senderError = error instanceof MailSenderError ? error : null;
  const details = [
    senderError?.code ? `[${senderError.code}]` : "",
    error instanceof Error ? error.message : "Mail delivery failed",
    senderError?.requestId ? `(RequestId: ${senderError.requestId})` : "",
  ].filter(Boolean).join(" ");
  let safe = details.replace(/https?:\/\/\S+/gi, "[url redacted]");
  for (const secret of [process.env.TENCENT_SECRET_ID, process.env.TENCENT_SECRET_KEY, process.env.SMTP_PASSWORD]) {
    if (secret) safe = safe.replaceAll(secret, "[credential redacted]");
  }
  return safe.slice(0, 500);
}

export function isPermanentMailError(error: unknown) {
  return error instanceof MailSenderError && !error.retryable;
}

export function shouldTerminateMail(error: unknown, attempts: number) {
  if (error instanceof MailSenderError && error.code === "FailedOperation.ExceedSendLimit") {
    return false;
  }
  return isPermanentMailError(error) || attempts >= 5;
}

export function attemptsAfterMailFailure(error: unknown, attempts: number) {
  if (error instanceof MailSenderError && error.code === "FailedOperation.ExceedSendLimit") {
    return Math.max(0, attempts - 1);
  }
  return attempts;
}

export function nextMailAttemptAt(error: unknown, attempts: number, now = new Date()) {
  if (error instanceof MailSenderError && error.code === "FailedOperation.ExceedSendLimit") {
    const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1_000);
    return new Date(Date.UTC(
      shanghai.getUTCFullYear(),
      shanghai.getUTCMonth(),
      shanghai.getUTCDate() + 1,
      0,
      5,
    ) - 8 * 60 * 60 * 1_000);
  }
  return new Date(now.getTime() + Math.min(60, 2 ** attempts) * 60_000);
}

async function verificationMailIsCurrent(mail: ClaimedMail, normalized: ReturnType<typeof normalizeMail>) {
  if (normalized.template !== "verify_email") return true;
  const [pending] = await db.select({
    email: pendingRegistrations.email,
    tokenDigest: pendingRegistrations.tokenDigest,
    expiresAt: pendingRegistrations.expiresAt,
    verifiedAt: pendingRegistrations.verifiedAt,
    consumedAt: pendingRegistrations.consumedAt,
  }).from(pendingRegistrations).where(eq(pendingRegistrations.email, mail.recipient)).limit(1);
  return isCurrentPendingVerificationMail(normalized, mail.recipient, pending);
}

async function redactSupersededVerificationMail(id: string) {
  const now = new Date();
  await db.update(mailOutbox).set({
    status: "failed",
    payloadEnc: null,
    redactedAt: now,
    lastError: SUPERSEDED_VERIFICATION_MAIL_ERROR,
  }).where(and(eq(mailOutbox.id, id), eq(mailOutbox.status, "sending")));
}

export async function processMailOutbox(limit = 10) {
  const due = await pool.query(`
    SELECT 1 FROM mail_outbox
    WHERE status IN ('pending', 'sending') AND next_attempt_at <= now() AND payload_enc IS NOT NULL
    LIMIT 1
  `);
  if (!due.rowCount) return 0;
  const sender = getMailSender();
  const result = await pool.query<ClaimedMail>(`
    UPDATE mail_outbox
    SET status = 'sending', attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes'
    WHERE id IN (
      SELECT id FROM mail_outbox
      WHERE status IN ('pending', 'sending') AND next_attempt_at <= now() AND payload_enc IS NOT NULL
      ORDER BY next_attempt_at
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    RETURNING id, template, recipient, payload_enc, attempts
  `, [limit]);
  if (!result.rowCount) return 0;

  for (const mail of result.rows) {
    try {
      const normalized = normalizeMail(mail);
      // 行可能在认领后、真正调用 SES 前被一次重发取代；最后再以数据库里的当前
      // token 为准，避免把必然失效的旧链接发送出去。
      if (!await verificationMailIsCurrent(mail, normalized)) {
        await redactSupersededVerificationMail(mail.id);
        continue;
      }
      await sender.send({ to: mail.recipient, ...normalized });
      await db.update(mailOutbox).set({
        status: "sent",
        sentAt: new Date(),
        redactedAt: new Date(),
        payloadEnc: null,
        lastError: null,
      }).where(eq(mailOutbox.id, mail.id));
    } catch (error) {
      const terminal = shouldTerminateMail(error, mail.attempts);
      await db.update(mailOutbox).set({
        status: terminal ? "failed" : "pending",
        attempts: attemptsAfterMailFailure(error, mail.attempts),
        nextAttemptAt: nextMailAttemptAt(error, mail.attempts),
        lastError: safeError(error),
        ...(terminal ? { redactedAt: new Date(), payloadEnc: null } : {}),
      }).where(eq(mailOutbox.id, mail.id));
    }
  }
  return result.rowCount;
}
