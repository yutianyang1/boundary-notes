import { createHash, randomBytes } from "node:crypto";

export function createActionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenDigest: digestActionToken(token) };
}

export function digestActionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
