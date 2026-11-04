import assert from "node:assert/strict";
import test from "node:test";
import { mobileRegistrationSchema } from "./registration-input";

const complete = { action: "complete", token: "a".repeat(43), name: "Reader", password: "A-valid-passphrase!", confirmPassword: "A-valid-passphrase!" };
test("native registration cannot supply a role, verification state, or another email at completion", () => {
  assert(mobileRegistrationSchema.safeParse(complete).success);
  for (const extra of [{ role: "admin" }, { email: "other@example.com" }, { emailVerified: true }, { verifiedAt: new Date().toISOString() }]) {
    assert.equal(mobileRegistrationSchema.safeParse({ ...complete, ...extra }).success, false);
  }
});
test("registration proof and password payloads are bounded", () => {
  for (const token of ["short", "x".repeat(257), "https://evil.example/verify-email", "../" + "x".repeat(30)]) {
    assert.equal(mobileRegistrationSchema.safeParse({ action: "verify", token }).success, false);
  }
  assert.equal(mobileRegistrationSchema.safeParse({ ...complete, password: "x".repeat(1025) }).success, false);
  assert.equal(mobileRegistrationSchema.safeParse({ action: "request", email: "reader@example.com", resend: true }).success, true);
});
