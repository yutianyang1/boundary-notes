import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

const WINDOW_SECONDS = 60 * 60;
const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

function key(kind: "ip" | "email", value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `subscribe:${kind}:${digest}`;
}

async function consume(keyName: string, limit: number) {
  const redis = await getRedis();
  if (!redis) return false;
  const count = await redis.eval(script, {
    keys: [keyName],
    arguments: [String(WINDOW_SECONDS)],
  });
  return Number(count) <= limit;
}

export async function allowSubscriptionRequest(ip: string | null, email: string) {
  try {
    if (!await consume(key("ip", ip ?? "unknown"), 5)) return false;
    return consume(key("email", email), 1);
  } catch {
    return false;
  }
}
