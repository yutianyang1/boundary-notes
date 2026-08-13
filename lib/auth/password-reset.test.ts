import assert from "node:assert/strict";
import test from "node:test";
import { isPasswordResetEligible, PASSWORD_RESET_RESPONSE } from "./password-reset";

test("password reset eligibility rejects missing, disabled, deleted, and OAuth-only users", () => {
  const valid = { passwordHash: "hash", disabledAt: null, deletedAt: null };
  assert.equal(isPasswordResetEligible(valid), true);
  assert.equal(isPasswordResetEligible(null), false);
  assert.equal(isPasswordResetEligible({ ...valid, passwordHash: null }), false);
  assert.equal(isPasswordResetEligible({ ...valid, disabledAt: new Date() }), false);
  assert.equal(isPasswordResetEligible({ ...valid, deletedAt: new Date() }), false);
});

test("password reset request uses one enumeration-safe response", () => {
  assert.equal(PASSWORD_RESET_RESPONSE, "如果该邮箱可用，重置邮件将会发送");
});
