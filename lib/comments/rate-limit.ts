import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

function key(userId: string, window: "minute" | "hour") {
  const digest = createHash("sha256").update(userId).digest("hex");
  return `comment:${window}:${digest}`;
}

export function areCommentCountsAllowed(minuteCount: number, hourCount: number) {
  return minuteCount <= 3 && hourCount <= 20;
}

async function consume(keyName: string, seconds: number) {
  const redis = await getRedis();
  if (!redis) return Number.POSITIVE_INFINITY;
  return Number(await redis.eval(script, { keys: [keyName], arguments: [String(seconds)] }));
}

export async function allowCommentRequest(userId: string) {
  try {
    const [minuteCount, hourCount] = await Promise.all([
      consume(key(userId, "minute"), 60),
      consume(key(userId, "hour"), 60 * 60),
    ]);
    return areCommentCountsAllowed(minuteCount, hourCount);
  } catch {
    return false;
  }
}
