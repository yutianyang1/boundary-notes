import assert from "node:assert/strict";
import test from "node:test";
import {
  createMfaUpgradeProof,
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  recoveryCodeDigest,
  resolveInitialAuthState,
  totpCode,
  verifyMfaUpgradeProof,
  verifyTotp,
} from "./mfa";

const originalKey = process.env.MFA_SECRET_KEY;
process.env.MFA_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
test.after(() => { process.env.MFA_SECRET_KEY = originalKey; });

test("staff MFA state distinguishes challenge, enrollment and grace", () => {
  const now = new Date("2026-08-05T00:00:00Z");
  assert.deepEqual(resolveInitialAuthState({ role: "admin", mfaEnabled: true, mfaRequiredAfter: null, staffMfaEnforced: true }, now), { authState: "mfa_pending", aal: 1 });
  assert.deepEqual(resolveInitialAuthState({ role: "admin", mfaEnabled: false, mfaRequiredAfter: null, staffMfaEnforced: true }, now), { authState: "mfa_enrollment_required", aal: 1 });
  assert.deepEqual(resolveInitialAuthState({ role: "editor", mfaEnabled: false, mfaRequiredAfter: new Date("2026-08-06T00:00:00Z"), staffMfaEnforced: true }, now), { authState: "full", aal: 1 });
  assert.deepEqual(resolveInitialAuthState({ role: "reader", mfaEnabled: false, mfaRequiredAfter: null, staffMfaEnforced: true }, now), { authState: "full", aal: 1 });
});

test("TOTP accepts the current and adjacent time windows", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpCode(secret, 59_000), "287082");
  const current = totpCode(secret, 90_000);
  assert.equal(verifyTotp(secret, current, 90_000), true);
  assert.equal(verifyTotp(secret, current, 120_000), true);
  assert.equal(verifyTotp(secret, "000000", 90_000), false);
});

test("MFA secrets encrypt at rest and upgrade proofs are scoped and expire", () => {
  const encrypted = encryptMfaSecret("ABCDEF234567");
  assert.notEqual(encrypted.secretEnc, "ABCDEF234567");
  assert.equal(decryptMfaSecret(encrypted.secretEnc, encrypted.keyVersion), "ABCDEF234567");
  const proof = createMfaUpgradeProof("user-1", "session-1", 1_000_000);
  assert.equal(verifyMfaUpgradeProof(proof, "user-1", "session-1", 1_030_000), true);
  assert.equal(verifyMfaUpgradeProof(proof, "user-2", "session-1", 1_030_000), false);
  assert.equal(verifyMfaUpgradeProof(proof, "user-1", "session-1", 1_061_000), false);
});

test("recovery codes are unique-looking and normalized before hashing", () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.equal(recoveryCodeDigest(codes[0]), recoveryCodeDigest(codes[0].toLowerCase().replaceAll("-", "")));
});
