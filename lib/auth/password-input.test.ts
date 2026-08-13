import assert from "node:assert/strict";
import test from "node:test";
import { passwordSchema } from "./password-input";

test("shared password schema enforces the same 8 to 1024 character boundary", () => {
  assert.equal(passwordSchema.safeParse("a".repeat(7)).success, false);
  assert.equal(passwordSchema.safeParse("a".repeat(8)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(1_024)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(1_025)).success, false);
});
