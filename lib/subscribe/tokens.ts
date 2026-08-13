import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const raw = process.env.SUBSCRIBE_TOKEN_SECRET;
  if (!raw) throw new Error("SUBSCRIBE_TOKEN_SECRET is required when subscriptions are enabled");
  const value = Buffer.from(raw, "base64");
  if (value.length !== 32) {
    throw new Error("SUBSCRIBE_TOKEN_SECRET must be a base64-encoded 32-byte key");
  }
  return value;
}

export function unsubscribeToken(subscriberId: string) {
  return createHmac("sha256", secret()).update(subscriberId).digest("base64url");
}

export function verifyUnsubscribeToken(subscriberId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(subscriberId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
