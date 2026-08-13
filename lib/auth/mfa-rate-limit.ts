import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export async function allowMfaAttempt(userId: string, ip: string | null) {
  try {
    const redis = await getRedis();
    if (!redis) return false;
    const digest = createHash("sha256").update(`${userId}:${ip ?? "unknown"}`).digest("hex");
    const count = Number(await redis.eval(script, {
      keys: [`mfa-attempt:${digest}`],
      arguments: ["600"],
    }));
    return count <= 10;
  } catch {
    // Rate limiting is rebuildable state; do not lock every staff account out when Redis is unavailable.
    return true;
  }
}
