import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type AuthState = "full" | "mfa_pending" | "mfa_enrollment_required";
export type UserRole = "reader" | "author" | "editor" | "admin";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const MFA_KEY_VERSION = 1;

function mfaKey() {
  const raw = process.env.MFA_SECRET_KEY;
  if (!raw) throw new Error("MFA_SECRET_KEY is required when MFA is enabled");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MFA_SECRET_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function isStaffRole(role: UserRole) {
  return role !== "reader";
}

export function resolveInitialAuthState(input: {
  role: UserRole;
  mfaEnabled: boolean;
  mfaRequiredAfter: Date | null;
  staffMfaEnforced: boolean;
}, now = new Date()): { authState: AuthState; aal: 1 } {
  if (input.mfaEnabled) return { authState: "mfa_pending", aal: 1 };
  if (!input.staffMfaEnforced || !isStaffRole(input.role)) return { authState: "full", aal: 1 };
  if (input.mfaRequiredAfter && input.mfaRequiredAfter.getTime() > now.getTime()) {
    return { authState: "full", aal: 1 };
  }
  return { authState: "mfa_enrollment_required", aal: 1 };
}

export function generateTotpSecret(bytes = 20) {
  return encodeBase32(randomBytes(bytes));
}

export function encodeBase32(value: Uint8Array) {
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 value");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function totpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1_000 / TOTP_STEP_SECONDS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** TOTP_DIGITS);
  return binary.toString().padStart(TOTP_DIGITS, "0");
}

export function verifyTotp(secret: string, candidate: string, timestamp = Date.now()) {
  const normalized = candidate.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  return [-1, 0, 1].some((offset) => {
    const expected = totpCode(secret, timestamp + offset * TOTP_STEP_SECONDS * 1_000);
    return timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
  });
}

export function totpUri(secret: string, email: string, issuer = process.env.NEXT_PUBLIC_SITE_NAME ?? "边界笔记") {
  const label = `${issuer}:${email}`;
  const query = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(label)}?${query}`;
}

export function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretEnc: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64"),
    keyVersion: MFA_KEY_VERSION,
  };
}

export function decryptMfaSecret(secretEnc: string, keyVersion: number) {
  if (keyVersion !== MFA_KEY_VERSION) throw new Error("Unsupported MFA key version");
  const packed = Buffer.from(secretEnc, "base64");
  if (packed.length < 29) throw new Error("Invalid encrypted MFA secret");
  const decipher = createDecipheriv("aes-256-gcm", mfaKey(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = encodeBase32(randomBytes(8)).slice(0, 12);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  });
}

export function recoveryCodeDigest(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z2-7]/g, "");
  return createHmac("sha256", mfaKey()).update(`recovery:${normalized}`).digest("hex");
}

export function createMfaUpgradeProof(userId: string, sessionId: string, now = Date.now()) {
  const timestamp = Math.floor(now / 1_000);
  const signature = createHmac("sha256", mfaKey()).update(`${userId}:${sessionId}:${timestamp}`).digest("base64url");
  return `${timestamp}.${signature}`;
}

export function verifyMfaUpgradeProof(proof: string, userId: string, sessionId: string, now = Date.now()) {
  const [rawTimestamp, supplied] = proof.split(".");
  const timestamp = Number(rawTimestamp);
  if (!Number.isInteger(timestamp) || !supplied || Math.abs(Math.floor(now / 1_000) - timestamp) > 60) return false;
  const expected = createHmac("sha256", mfaKey()).update(`${userId}:${sessionId}:${timestamp}`).digest("base64url");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
