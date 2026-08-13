import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

const WINDOW_SECONDS = 60 * 60;
const IP_LIMIT = 5;
const EMAIL_LIMIT = 2;
const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

function rateLimitKey(kind: "ip" | "email", value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `password-reset:${kind}:${digest}`;
}

export function arePasswordResetCountsAllowed(ipCount: number, emailCount: number) {
  return ipCount <= IP_LIMIT && emailCount <= EMAIL_LIMIT;
}

async function consume(keyName: string) {
  const redis = await getRedis();
  if (!redis) throw new Error("Redis is unavailable");
  return Number(await redis.eval(script, {
    keys: [keyName],
    arguments: [String(WINDOW_SECONDS)],
  }));
}

export async function allowPasswordResetRequest(ip: string | null, email: string) {
  try {
    const ipCount = await consume(rateLimitKey("ip", ip ?? "unknown"));
    const emailCount = await consume(rateLimitKey("email", email));
    return arePasswordResetCountsAllowed(ipCount, emailCount);
  } catch {
    return false;
  }
}
