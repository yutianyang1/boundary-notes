import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decryptOutboxPayload, encryptOutboxPayload } from "./outbox";

test("outbox payload is encrypted and round-trips", () => {
  const previous = process.env.MAIL_OUTBOX_KEY;
  process.env.MAIL_OUTBOX_KEY = randomBytes(32).toString("base64");
  try {
    const payload = { verifyUrl: "https://example.test/verify?token=secret", name: "测试" };
    const encrypted = encryptOutboxPayload(payload);
    assert.equal(encrypted.includes("secret"), false);
    assert.deepEqual(decryptOutboxPayload(encrypted), payload);
  } finally {
    if (previous === undefined) delete process.env.MAIL_OUTBOX_KEY;
    else process.env.MAIL_OUTBOX_KEY = previous;
  }
});
