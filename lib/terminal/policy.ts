import { isIP } from "node:net";

export function allowedSshHosts(value = process.env.WEB_SSH_ALLOWED_HOSTS ?? "") {
  return new Set(value.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
}

export function isExplicitlyAllowedHost(host: string, allowed = allowedSshHosts()) {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  return allowed.has("*") || allowed.has(normalized);
}

export function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
      || a >= 224;
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
    if (mappedV4) return isPrivateAddress(mappedV4);
    return normalized === "::1"
      || normalized === "::"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8:");
  }
  return true;
}

export function normalizeHostKeyFingerprint(value: string) {
  return value.trim().replace(/^SHA256:/i, "").replace(/=+$/, "");
}
