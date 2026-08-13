import assert from "node:assert/strict";
import test from "node:test";
import { hash as bcryptHash } from "bcryptjs";
import { hashPassword, verifyPassword } from "./password";

test("new passwords use Argon2id and verify after NFC normalization", async () => {
  const composed = "mot-de-passe-très-long";
  const decomposed = composed.normalize("NFD");
  const passwordHash = await hashPassword(composed);
  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal((await verifyPassword(decomposed, passwordHash)).valid, true);
});

test("legacy bcrypt compares raw input and requests migration", async () => {
  const raw = "long-password-e\u0301";
  const passwordHash = await bcryptHash(raw, 4);
  const result = await verifyPassword(raw, passwordHash);
  assert.deepEqual(result, { valid: true, needsRehash: true });
  assert.equal((await verifyPassword(raw.normalize("NFC"), passwordHash)).valid, false);
});
