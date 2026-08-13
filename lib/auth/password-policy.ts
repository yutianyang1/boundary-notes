import { dictionary } from "@zxcvbn-ts/language-common";
import { normalizePassword } from "@/lib/auth/password";

const commonPasswords = new Set(
  dictionary["passwords-common"].map((password) => normalizePassword(password).toLocaleLowerCase("en-US")),
);

function canonical(value: string) {
  return normalizePassword(value).toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]/gu, "");
}

export function isBlockedPassword(
  password: string,
  context: { email?: string; name?: string } = {},
) {
  const normalized = normalizePassword(password).toLocaleLowerCase("en-US");
  if (commonPasswords.has(normalized)) return true;

  const value = canonical(password);
  const emailLocalPart = context.email?.split("@", 1)[0];
  return [context.name, emailLocalPart]
    .filter((item): item is string => Boolean(item))
    .some((item) => canonical(item) === value);
}

export const commonPasswordCount = commonPasswords.size;
