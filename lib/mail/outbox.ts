import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const raw = process.env.MAIL_OUTBOX_KEY;
  if (!raw) throw new Error("MAIL_OUTBOX_KEY is required when email features are enabled");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MAIL_OUTBOX_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function encryptOutboxPayload(payload: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptOutboxPayload(payloadEnc: string) {
  const packed = Buffer.from(payloadEnc, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as Record<string, unknown>;
}
