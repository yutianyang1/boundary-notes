/**
 * Web 终端的常用连接：只记主机、端口、用户名、登录方式和主机指纹，不记密码、私钥。
 * 这里是纯函数部分，读写浏览器存储见 components/admin/terminal-connection-store.ts。
 */

export type AuthMethod = "password" | "key";

export type SavedConnection = {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  /** 上次连接成功时核对过的指纹，带 SHA256: 前缀；没有则为空串。 */
  fingerprint: string;
  lastUsedAt: number;
};

export const MAX_SAVED_CONNECTIONS = 12;

// 与服务端 /api/admin/terminal/sessions 的校验保持一致，存进去的都能直接提交。
const HOST = /^[a-zA-Z0-9.:_-]{1,253}$/;
const FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{1,100}$/;

export function connectionKey(connection: Pick<SavedConnection, "host" | "port" | "username">) {
  return `${connection.username}@${connection.host.trim().toLowerCase()}:${connection.port}`;
}

export function connectionLabel(connection: Pick<SavedConnection, "host" | "port" | "username">) {
  return `${connection.username}@${connection.host}${connection.port === 22 ? "" : `:${connection.port}`}`;
}

function normalizeOne(value: unknown): SavedConnection | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const host = typeof input.host === "string" ? input.host.trim() : "";
  const username = typeof input.username === "string" ? input.username : "";
  const port = input.port;
  if (!HOST.test(host) || !username || username.length > 128) return null;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  const fingerprint = typeof input.fingerprint === "string" && FINGERPRINT.test(input.fingerprint) ? input.fingerprint : "";
  const lastUsedAt = typeof input.lastUsedAt === "number" && Number.isFinite(input.lastUsedAt) ? input.lastUsedAt : 0;
  return { host, port, username, authMethod: input.authMethod === "key" ? "key" : "password", fingerprint, lastUsedAt };
}

/** 存储里读出的内容不可信：丢掉坏条目，同一连接只留最近一次，按最近使用排序并截断。 */
export function normalizeSavedConnections(value: unknown): SavedConnection[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, SavedConnection>();
  for (const item of value) {
    const connection = normalizeOne(item);
    if (!connection) continue;
    const key = connectionKey(connection);
    const existing = byKey.get(key);
    if (!existing || existing.lastUsedAt < connection.lastUsedAt) byKey.set(key, connection);
  }
  return [...byKey.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_SAVED_CONNECTIONS);
}

export function rememberConnection(list: SavedConnection[], connection: SavedConnection) {
  const key = connectionKey(connection);
  return normalizeSavedConnections([connection, ...list.filter((item) => connectionKey(item) !== key)]);
}

export function forgetConnection(list: SavedConnection[], key: string) {
  return list.filter((item) => connectionKey(item) !== key);
}
