import assert from "node:assert/strict";
import test from "node:test";
import { commonPasswordCount, isBlockedPassword } from "./password-policy";

test("password blocklist contains a real common-password corpus", () => {
  assert.ok(commonPasswordCount > 40_000);
  assert.equal(isBlockedPassword("passwordpassword"), true);
  assert.equal(isBlockedPassword("a-unique-long-password-7Q!vP2#k"), false);
});

test("password blocklist rejects account-specific values", () => {
  assert.equal(isBlockedPassword("example-user", { email: "example-user@example.com" }), true);
  assert.equal(isBlockedPassword("Alice Zhang", { name: "Alice Zhang" }), true);
});
