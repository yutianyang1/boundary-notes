import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { unsubscribeToken, verifyUnsubscribeToken } from "./tokens";

test("unsubscribe HMAC is stable and rejects tampering without throwing", () => {
  const previous = process.env.SUBSCRIBE_TOKEN_SECRET;
  process.env.SUBSCRIBE_TOKEN_SECRET = randomBytes(32).toString("base64");
  try {
    const id = "5539eaf4-3dab-4c51-8e10-1b9e41a88980";
    const token = unsubscribeToken(id);
    assert.equal(unsubscribeToken(id), token);
    assert.equal(verifyUnsubscribeToken(id, token), true);
    assert.equal(verifyUnsubscribeToken(id, `${token}x`), false);
    assert.equal(verifyUnsubscribeToken(id, "short"), false);
  } finally {
    if (previous === undefined) delete process.env.SUBSCRIBE_TOKEN_SECRET;
    else process.env.SUBSCRIBE_TOKEN_SECRET = previous;
  }
});
