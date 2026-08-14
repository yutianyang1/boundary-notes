import assert from "node:assert/strict";
import test from "node:test";
import { createActionToken } from "@/lib/auth/action-tokens";
import type { NormalizedMail } from "@/lib/mail/message";
import {
  isCurrentPendingVerificationMail,
  verificationTokenDigest,
  type PendingVerificationState,
} from "./verification";

function verificationMail(token: string): NormalizedMail {
  return {
    template: "verify_email",
    subject: "验证你的邮箱",
    vars: { name: "读者", verifyPath: `en/verify-email?token=${encodeURIComponent(token)}` },
  };
}

test("verification mail extracts the token digest from a locale-aware path", () => {
  const { token, tokenDigest } = createActionToken();
  assert.equal(verificationTokenDigest(verificationMail(token)), tokenDigest);
});

test("only the current unverified pending registration mail remains sendable", () => {
  const now = new Date("2026-08-14T00:00:00.000Z");
  const { token, tokenDigest } = createActionToken();
  const mail = verificationMail(token);
  const pending: PendingVerificationState = {
    email: "reader@example.test",
    tokenDigest,
    expiresAt: new Date("2026-08-15T00:00:00.000Z"),
    verifiedAt: null,
    consumedAt: null,
  };

  assert.equal(isCurrentPendingVerificationMail(mail, pending.email, pending, now), true);
  assert.equal(isCurrentPendingVerificationMail(mail, "other@example.test", pending, now), false);
  assert.equal(isCurrentPendingVerificationMail(mail, pending.email, { ...pending, tokenDigest: "0".repeat(64) }, now), false);
  assert.equal(isCurrentPendingVerificationMail(mail, pending.email, { ...pending, expiresAt: now }, now), false);
  assert.equal(isCurrentPendingVerificationMail(mail, pending.email, { ...pending, verifiedAt: now }, now), false);
  assert.equal(isCurrentPendingVerificationMail(mail, pending.email, { ...pending, consumedAt: now }, now), false);
  assert.equal(isCurrentPendingVerificationMail(mail, pending.email, undefined, now), false);
});

test("malformed verification paths and other templates are never treated as current verification mail", () => {
  assert.equal(verificationTokenDigest(verificationMail("short")), null);
  assert.equal(verificationTokenDigest({
    template: "password_reset",
    subject: "重置密码",
    vars: { resetPath: "en/reset-password?token=anything" },
  }), null);
});
