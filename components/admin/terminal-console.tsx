"use client";

import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionState = "idle" | "connecting" | "connected" | "closed";
type ServerEvent = { type: "data"; data: string } | { type: "exit"; message: string };

export function TerminalConsole() {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventsRef = useRef<EventSource | null>(null);
  const inputRef = useRef("");
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const [state, setState] = useState<ConnectionState>("idle");
  const [message, setMessage] = useState("填写目标主机后连接。");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [fingerprint, setFingerprint] = useState("");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const postAction = useCallback(async (body: object) => {
    const id = sessionIdRef.current;
    if (!id) return;
    await fetch(`/api/admin/terminal/sessions/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  const flushInput = useCallback(() => {
    inputTimerRef.current = null;
    const data = inputRef.current;
    inputRef.current = "";
    if (data) void postAction({ type: "input", data });
  }, [postAction]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let inputDisposable: { dispose(): void } | undefined;

    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([xterm, fit]) => {
      if (disposed || !mountRef.current) return;
      const terminal = new xterm.Terminal({
        cursorBlink: true,
        convertEol: false,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 14,
        scrollback: 5_000,
        theme: {
          background: "#0b1020",
          foreground: "#e5e7eb",
          cursor: "#a5b4fc",
          selectionBackground: "#334155",
        },
      });
      const fitAddon = new fit.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(mountRef.current);
      fitAddon.fit();
      terminal.writeln("\x1b[38;5;111m边界笔记 Web SSH\x1b[0m");
      terminal.writeln("连接成功后，输入会直接发送到目标主机。\r\n");
      terminalRef.current = terminal;
      fitRef.current = fitAddon;
      inputDisposable = terminal.onData((data) => {
        if (!sessionIdRef.current) return;
        inputRef.current += data;
        if (!inputTimerRef.current) inputTimerRef.current = setTimeout(flushInput, 12);
      });
      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (sessionIdRef.current) void postAction({ type: "resize", cols: terminal.cols, rows: terminal.rows });
      });
      resizeObserver.observe(mountRef.current);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      inputDisposable?.dispose();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [flushInput, postAction]);

  const disconnect = useCallback(async (notifyServer = true) => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    eventsRef.current?.close();
    eventsRef.current = null;
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
    inputTimerRef.current = null;
    inputRef.current = "";
    if (notifyServer && id) {
      await fetch(`/api/admin/terminal/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    }
    setState("closed");
  }, []);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (sessionIdRef.current) await disconnect();
    fitRef.current?.fit();
    setState("connecting");
    setMessage("正在建立 SSH 连接…");

    const response = await fetch("/api/admin/terminal/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: String(form.get("host") ?? ""),
        port: Number(form.get("port") ?? 22),
        username: String(form.get("username") ?? ""),
        password: authMethod === "password" ? password : undefined,
        privateKey: authMethod === "key" ? privateKey : undefined,
        passphrase: authMethod === "key" && passphrase ? passphrase : undefined,
        hostKeyFingerprint: fingerprint || undefined,
        cols: terminal.cols,
        rows: terminal.rows,
      }),
    }).catch(() => null);

    if (!response) {
      setState("closed");
      setMessage("网络请求失败，请稍后重试。");
      return;
    }
    const payload = await response.json().catch(() => ({})) as { id?: string; error?: string; fingerprint?: string };
    if (!response.ok || !payload.id) {
      if (payload.fingerprint) setFingerprint(payload.fingerprint);
      setState("closed");
      setMessage(payload.error ?? "SSH 连接失败。");
      return;
    }

    sessionIdRef.current = payload.id;
    setPassword("");
    setPrivateKey("");
    setPassphrase("");
    setState("connected");
    setMessage(`已连接；主机指纹 ${payload.fingerprint ?? fingerprint}`);
    terminal.reset();
    terminal.focus();

    const source = new EventSource(`/api/admin/terminal/sessions/${encodeURIComponent(payload.id)}/events`);
    eventsRef.current = source;
    source.onmessage = (item) => {
      const serverEvent = JSON.parse(item.data) as ServerEvent;
      if (serverEvent.type === "data") {
        const binary = atob(serverEvent.data);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        terminal.write(decoderRef.current.decode(bytes, { stream: true }));
      } else {
        terminal.writeln(`\r\n\x1b[38;5;203m${serverEvent.message}\x1b[0m`);
        setMessage(serverEvent.message);
        void disconnect(false);
      }
    };
    source.onerror = () => {
      if (sessionIdRef.current) setMessage("终端输出连接中断，正在由浏览器重试…");
    };
  }

  const connected = state === "connected";
  const busy = state === "connecting";

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <form onSubmit={connect} className="rounded-[var(--radius-card)] border bg-card p-5 [box-shadow:var(--shadow-sm)]">
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            主机名或 IP
            <input name="host" required disabled={busy || connected} placeholder="server.example.com" className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
          </label>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              用户名
              <input name="username" required disabled={busy || connected} autoComplete="username" placeholder="root" className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              端口
              <input name="port" type="number" min="1" max="65535" defaultValue="22" required disabled={busy || connected} className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
            </label>
          </div>
          <fieldset disabled={busy || connected} className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">登录方式</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={authMethod === "password"} onChange={() => setAuthMethod("password")} />密码</label>
              <label className="flex items-center gap-2"><input type="radio" checked={authMethod === "key"} onChange={() => setAuthMethod("key")} />私钥</label>
            </div>
            {authMethod === "password" ? (
              <label className="grid gap-1.5 text-sm font-medium">
                密码
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="h-10 rounded-md border bg-background px-3" />
              </label>
            ) : (
              <>
                <label className="grid gap-1.5 text-sm font-medium">
                  OpenSSH 私钥
                  <textarea value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} required rows={7} spellCheck={false} className="rounded-md border bg-background p-3 font-mono text-xs" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  私钥口令（可选）
                  <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" className="h-10 rounded-md border bg-background px-3" />
                </label>
              </>
            )}
          </fieldset>
          <label className="grid gap-1.5 text-sm font-medium">
            SHA256 主机指纹
            <input value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} disabled={busy || connected} placeholder="首次连接后显示，核对再重试" className="h-10 rounded-md border bg-background px-3 font-mono text-xs" />
          </label>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={busy || connected} className="h-10 flex-1 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "连接中…" : "连接"}
            </button>
            <button type="button" disabled={!connected} onClick={() => void disconnect()} className="h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-50">断开</button>
          </div>
        </div>
      </form>

      <section className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border bg-[#0b1020] [box-shadow:var(--shadow)]">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-2.5 text-xs text-slate-300">
          <span className="truncate">{message}</span>
          <span className={`shrink-0 rounded-full px-2 py-1 ${connected ? "bg-emerald-400/15 text-emerald-300" : busy ? "bg-amber-400/15 text-amber-300" : "bg-white/10"}`}>
            {connected ? "已连接" : busy ? "连接中" : "未连接"}
          </span>
        </div>
        <div ref={mountRef} className="h-[min(68vh,46rem)] min-h-[28rem] p-2" />
      </section>
    </div>
  );
}
