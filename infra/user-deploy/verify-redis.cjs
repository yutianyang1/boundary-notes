/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("redis");

async function main() {
  const startedAt = Date.now();
  const client = createClient({
    url: process.env.REDIS_URL,
    RESP: 2,
    disableClientInfo: true,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: false,
    },
  });
  client.on("error", () => undefined);
  await client.connect();
  const reply = await client.ping();
  await client.quit();
  if (reply !== "PONG") throw new Error(`Unexpected Redis reply: ${reply}`);
  process.stdout.write(`Redis PONG in ${Date.now() - startedAt}ms\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
