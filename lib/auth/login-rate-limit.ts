import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

function key(kind: "ip" | "email", value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `login:${kind}:${digest}`;
}

export function areLoginCountsAllowed(ipCount: number, emailCount: number) {
  return ipCount <= 20 && emailCount <= 10;
}

export async function allowLoginAttempt(ip: string | null, email: string) {
  try {
    const redis = await getRedis();
    if (!redis) return true;
    const consume = (keyName: string) => redis.eval(script, { keys: [keyName], arguments: ["600"] });
    const [ipCount, emailCount] = await Promise.all([
      consume(key("ip", ip ?? "unknown")),
      consume(key("email", email)),
    ]);
    return areLoginCountsAllowed(Number(ipCount), Number(emailCount));
  } catch {
    return true;
  }
}
