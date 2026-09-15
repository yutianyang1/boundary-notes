import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import {
  isExplicitlyAllowedHost,
  isPrivateAddress,
  normalizeHostKeyFingerprint,
  normalizeTerminalUploadName,
} from "@/lib/terminal/policy";

const CONNECT_TIMEOUT_MS = 15_000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_LIFETIME_MS = 8 * 60 * 60 * 1_000;
const CLOSED_RETENTION_MS = 60_000;
const MAX_GLOBAL_SESSIONS = 8;
const MAX_USER_SESSIONS = 2;
const MAX_HISTORY_BYTES = 1_000_000;

export type TerminalEvent =
  | { type: "data"; data: string }
  | { type: "exit"; message: string };
export type StoredTerminalEvent = { id: number; event: TerminalEvent };

export type CreateTerminalInput = {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  hostKeyFingerprint?: string;
  cols: number;
  rows: number;
};

type TerminalSession = {
  id: string;
  ownerId: string;
  host: string;
  port: number;
  username: string;
  fingerprint: string;
  client: Client;
  stream: ClientChannel;
  events: EventEmitter;
  history: StoredTerminalEvent[];
  historyBytes: number;
  nextEventId: number;
  closed: boolean;
  uploading: boolean;
  idleTimer: NodeJS.Timeout;
  lifetimeTimer: NodeJS.Timeout;
};

export class WebSshError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly fingerprint?: string,
  ) {
    super(message);
    this.name = "WebSshError";
  }
}

const globalStore = globalThis as typeof globalThis & {
  __blogWebSshSessions?: Map<string, TerminalSession>;
};
const sessions = globalStore.__blogWebSshSessions ??= new Map<string, TerminalSession>();

function emit(session: TerminalSession, event: TerminalEvent) {
  const bytes = event.type === "data" ? Buffer.byteLength(event.data, "base64") : event.message.length;
  const stored = { id: session.nextEventId++, event };
  session.history.push(stored);
  session.historyBytes += bytes;
  while (session.historyBytes > MAX_HISTORY_BYTES && session.history.length > 1) {
    const removed = session.history.shift();
    if (removed) session.historyBytes -= removed.event.type === "data"
      ? Buffer.byteLength(removed.event.data, "base64")
      : removed.event.message.length;
  }
  session.events.emit("event", stored);
}

function touch(session: TerminalSession) {
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => closeTerminalSession(session.id, session.ownerId, "连接空闲超时。"), IDLE_TIMEOUT_MS);
  session.idleTimer.unref();
}

function close(session: TerminalSession, message: string) {
  if (session.closed) return;
  session.closed = true;
  clearTimeout(session.idleTimer);
  clearTimeout(session.lifetimeTimer);
  emit(session, { type: "exit", message });
  session.stream.end();
  session.client.end();
  const cleanup = setTimeout(() => sessions.delete(session.id), CLOSED_RETENTION_MS);
  cleanup.unref();
}

async function resolveDestination(host: string) {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  const addresses = await lookup(normalized, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) throw new WebSshError("HOST_NOT_FOUND", "无法解析目标主机。", 400);
  if (!isExplicitlyAllowedHost(normalized) && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new WebSshError(
      "HOST_NOT_ALLOWED",
      "默认禁止连接本机、内网和云元数据地址；请在 WEB_SSH_ALLOWED_HOSTS 中明确加入该主机。",
      403,
    );
  }
  return addresses[0].address;
}

function requireOwnedSession(id: string, ownerId: string) {
  const session = sessions.get(id);
  if (!session || session.ownerId !== ownerId) {
    throw new WebSshError("SESSION_NOT_FOUND", "终端会话不存在或已过期。", 404);
  }
  return session;
}

export async function createTerminalSession(ownerId: string, input: CreateTerminalInput) {
  const active = [...sessions.values()].filter((session) => !session.closed);
  if (active.length >= MAX_GLOBAL_SESSIONS || active.filter((session) => session.ownerId === ownerId).length >= MAX_USER_SESSIONS) {
    throw new WebSshError("TOO_MANY_SESSIONS", "活动终端数量已达上限，请先关闭已有连接。", 429);
  }

  const destination = await resolveDestination(input.host);
  const expected = input.hostKeyFingerprint
    ? normalizeHostKeyFingerprint(input.hostKeyFingerprint)
    : "";
  let observed = "";
  const client = new Client();

  const stream = await new Promise<ClientChannel>((resolve, reject) => {
    let settled = false;
    const finishError = (error: unknown) => {
      if (settled) return;
      settled = true;
      client.end();
      if (!expected && observed) {
        reject(new WebSshError(
          "HOST_KEY_REQUIRED",
          `请核对主机指纹 SHA256:${observed}，确认无误后重新连接。`,
          409,
          `SHA256:${observed}`,
        ));
        return;
      }
      if (expected && observed && expected !== observed) {
        reject(new WebSshError("HOST_KEY_MISMATCH", "主机指纹与填写值不一致，连接已拒绝。", 409, `SHA256:${observed}`));
        return;
      }
      const message = error instanceof Error ? error.message : "SSH 连接失败。";
      reject(new WebSshError("SSH_CONNECTION_FAILED", message, 502));
    };
    const timer = setTimeout(() => finishError(new Error("SSH 连接超时。")), CONNECT_TIMEOUT_MS);
    timer.unref();

    client
      .once("ready", () => {
        client.shell({ term: "xterm-256color", cols: input.cols, rows: input.rows }, (error, channel) => {
          if (error) return finishError(error);
          if (settled) return channel.end();
          settled = true;
          clearTimeout(timer);
          resolve(channel);
        });
      })
      .once("error", finishError)
      .on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
        finish(input.password ? prompts.map(() => input.password as string) : []);
      })
      .connect({
        host: destination,
        port: input.port,
        username: input.username,
        password: input.password,
        privateKey: input.privateKey,
        passphrase: input.passphrase,
        tryKeyboard: Boolean(input.password),
        readyTimeout: CONNECT_TIMEOUT_MS,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
        hostVerifier(key: Buffer) {
          observed = createHash("sha256").update(key).digest("base64").replace(/=+$/, "");
          return Boolean(expected) && expected === observed;
        },
      });
  });

  const id = randomUUID();
  const events = new EventEmitter();
  events.setMaxListeners(5);
  const placeholder = setTimeout(() => undefined, IDLE_TIMEOUT_MS);
  placeholder.unref();
  const session: TerminalSession = {
    id,
    ownerId,
    host: input.host,
    port: input.port,
    username: input.username,
    fingerprint: `SHA256:${observed}`,
    client,
    stream,
    events,
    history: [],
    historyBytes: 0,
    nextEventId: 1,
    closed: false,
    uploading: false,
    idleTimer: placeholder,
    lifetimeTimer: placeholder,
  };
  sessions.set(id, session);
  touch(session);
  session.lifetimeTimer = setTimeout(() => close(session, "终端已达到最长连接时间。"), MAX_LIFETIME_MS);
  session.lifetimeTimer.unref();

  stream.on("data", (chunk: Buffer) => {
    touch(session);
    emit(session, { type: "data", data: chunk.toString("base64") });
  });
  stream.stderr.on("data", (chunk: Buffer) => {
    touch(session);
    emit(session, { type: "data", data: chunk.toString("base64") });
  });
  stream.once("close", () => close(session, "SSH 连接已关闭。"));
  client.once("error", (error) => close(session, `SSH 错误：${error.message}`));
  client.once("close", () => close(session, "SSH 连接已断开。"));

  return { id, fingerprint: session.fingerprint, host: session.host, port: session.port, username: session.username };
}

export function subscribeTerminalSession(
  id: string,
  ownerId: string,
  afterEventId: number,
  listener: (event: StoredTerminalEvent) => void,
) {
  const session = requireOwnedSession(id, ownerId);
  for (const event of session.history) if (event.id > afterEventId) listener(event);
  session.events.on("event", listener);
  touch(session);
  return () => session.events.off("event", listener);
}

export function writeTerminalSession(id: string, ownerId: string, data: string) {
  const session = requireOwnedSession(id, ownerId);
  if (session.closed) throw new WebSshError("SESSION_CLOSED", "SSH 连接已经关闭。", 409);
  if (Buffer.byteLength(data) > 16_384) throw new WebSshError("INPUT_TOO_LARGE", "单次终端输入过长。", 413);
  touch(session);
  session.stream.write(data);
}

export function resizeTerminalSession(id: string, ownerId: string, cols: number, rows: number) {
  const session = requireOwnedSession(id, ownerId);
  if (session.closed) throw new WebSshError("SESSION_CLOSED", "SSH 连接已经关闭。", 409);
  touch(session);
  session.stream.setWindow(rows, cols, 0, 0);
}

export async function uploadTerminalFile(id: string, ownerId: string, filename: string, data: Buffer) {
  const session = requireOwnedSession(id, ownerId);
  if (session.closed) throw new WebSshError("SESSION_CLOSED", "SSH 连接已经关闭。", 409);
  if (session.uploading) throw new WebSshError("UPLOAD_IN_PROGRESS", "已有文件正在上传，请稍后重试。", 409);
  const safeName = normalizeTerminalUploadName(filename);
  if (!safeName) throw new WebSshError("INVALID_FILENAME", "文件名无效或过长。", 400);
  if (data.length === 0) throw new WebSshError("EMPTY_FILE", "不能上传空文件。", 400);

  session.uploading = true;
  touch(session);
  let sftp: SFTPWrapper | undefined;
  try {
    sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      session.client.sftp((error, channel) => error ? reject(error) : resolve(channel));
    });
    const channel = sftp;
    const home = await new Promise<string>((resolve, reject) => {
      channel.realpath(".", (error, remotePath) => error ? reject(error) : resolve(remotePath));
    });
    const remotePath = `${home.replace(/\/+$/, "")}/${safeName}`;
    const exists = await new Promise<boolean>((resolve, reject) => {
      channel.lstat(remotePath, (error) => {
        if (!error) return resolve(true);
        if ((error as Error & { code?: number }).code === 2) return resolve(false);
        reject(error);
      });
    });
    if (exists) throw new WebSshError("FILE_EXISTS", `远端已存在同名文件：${remotePath}`, 409);
    await new Promise<void>((resolve, reject) => {
      channel.writeFile(remotePath, data, { flag: "wx", mode: 0o600 }, (error) => error ? reject(error) : resolve());
    });
    touch(session);
    return { path: remotePath, bytes: data.length };
  } catch (error) {
    if (error instanceof WebSshError) throw error;
    const message = error instanceof Error ? error.message : "SFTP 上传失败。";
    throw new WebSshError("SFTP_UPLOAD_FAILED", `SFTP 上传失败：${message}`, 502);
  } finally {
    sftp?.end();
    session.uploading = false;
  }
}

export function closeTerminalSession(id: string, ownerId: string, message = "终端已由用户关闭。") {
  const session = requireOwnedSession(id, ownerId);
  close(session, message);
}
