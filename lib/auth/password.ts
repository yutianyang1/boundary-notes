import { hash, verify } from "@node-rs/argon2";
import { compare } from "bcryptjs";

const argonOptions = {
  algorithm: 2,
  memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19_456),
  timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
  parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
  outputLen: 32,
};

export function normalizePassword(password: string) {
  return password.normalize("NFC");
}

export function hashPassword(password: string) {
  return hash(normalizePassword(password), argonOptions);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (passwordHash.startsWith("$argon2id$")) {
    return { valid: await verify(passwordHash, normalizePassword(password)), needsRehash: false };
  }

  // Legacy bcrypt hashes were produced from the raw bytes. Normalize only after
  // a successful legacy comparison, otherwise Unicode passwords can be locked out.
  const valid = await compare(password, passwordHash);
  return { valid, needsRehash: valid };
}
