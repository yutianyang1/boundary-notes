import { createClient } from "redis";

function createRedisClient() {
  return createClient({
    url: process.env.REDIS_URL,
    RESP: 2,
    disableClientInfo: true,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: false,
    },
  });
}

type AppRedisClient = ReturnType<typeof createRedisClient>;

const globalForRedis = globalThis as unknown as {
  redis?: AppRedisClient;
  redisConnecting?: Promise<AppRedisClient | null>;
};

export async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (globalForRedis.redis?.isReady) return globalForRedis.redis;
  if (globalForRedis.redisConnecting) return globalForRedis.redisConnecting;

  const client = globalForRedis.redis ?? createRedisClient();
  client.on("error", () => undefined);
  globalForRedis.redis = client;
  globalForRedis.redisConnecting = client.connect()
    .then(() => client)
    .catch(() => {
      client.destroy();
      if (globalForRedis.redis === client) globalForRedis.redis = undefined;
      return null;
    })
    .finally(() => { globalForRedis.redisConnecting = undefined; });
  return globalForRedis.redisConnecting;
}
