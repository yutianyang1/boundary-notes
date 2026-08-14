import { digestActionToken } from "@/lib/auth/action-tokens";
import type { NormalizedMail } from "@/lib/mail/message";

export const SUPERSEDED_VERIFICATION_MAIL_ERROR = "Superseded by a newer verification email";

export type PendingVerificationState = {
  email: string;
  tokenDigest: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  consumedAt: Date | null;
};

export function verificationTokenDigest(mail: NormalizedMail) {
  if (mail.template !== "verify_email") return null;
  const token = new URL(mail.vars.verifyPath, "https://mail-path.invalid/").searchParams.get("token");
  if (!token || token.length < 20 || token.length > 512) return null;
  return digestActionToken(token);
}

export function isCurrentPendingVerificationMail(
  mail: NormalizedMail,
  recipient: string,
  pending: PendingVerificationState | undefined,
  now = new Date(),
) {
  const tokenDigest = verificationTokenDigest(mail);
  return Boolean(
    tokenDigest
    && pending
    && pending.email === recipient
    && pending.tokenDigest === tokenDigest
    && pending.expiresAt > now
    && !pending.verifiedAt
    && !pending.consumedAt,
  );
}
