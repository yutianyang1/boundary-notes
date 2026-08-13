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

function key(kind: "ip" | "email", value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `register:${kind}:${digest}`;
}

export function areRegistrationCountsAllowed(ipCount: number, emailCount: number) {
  return ipCount <= IP_LIMIT && emailCount <= EMAIL_LIMIT;
}

async function consume(keyName: string) {
  const redis = await getRedis();
  if (!redis) throw new Error("Redis is unavailable");
  return Number(await redis.eval(script, { keys: [keyName], arguments: [String(WINDOW_SECONDS)] }));
}

export async function allowRegistrationRequest(ip: string | null, email: string) {
  try {
    const [ipCount, emailCount] = await Promise.all([
      consume(key("ip", ip ?? "unknown")),
      consume(key("email", email)),
    ]);
    return areRegistrationCountsAllowed(ipCount, emailCount);
  } catch {
    // Registration sends email and creates durable state, so fail closed.
    return false;
  }
}
