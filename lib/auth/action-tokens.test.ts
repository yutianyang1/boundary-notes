import assert from "node:assert/strict";
import test from "node:test";
import { createActionToken, digestActionToken } from "./action-tokens";

test("business tokens are high entropy and only their digest is persisted", () => {
  const first = createActionToken();
  const second = createActionToken();
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenDigest, digestActionToken(first.token));
  assert.match(first.tokenDigest, /^[a-f0-9]{64}$/);
});
