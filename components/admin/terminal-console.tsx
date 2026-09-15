"use client";

import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { Maximize2, Minimize2, Minus, SquareTerminal, X } from "lucide-react";
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
  const [connectionTitle, setConnectionTitle] = useState("Linux shell");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [fingerprint, setFingerprint] = useState("");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(true);

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
    setMinimized(false);
    setMaximized(true);
    setState("closed");
  }, []);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  useEffect(() => {
    if (state !== "connected" || !mountRef.current || !sessionIdRef.current) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let inputDisposable: { dispose(): void } | undefined;

    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([xterm, fit]) => {
      if (disposed || !mountRef.current || !sessionIdRef.current) return;
      const terminal = new xterm.Terminal({
        cursorBlink: true,
        convertEol: false,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 14,
        lineHeight: 1.15,
        scrollback: 5_000,
        theme: {
          background: "#070b14",
          foreground: "#e5e7eb",
          cursor: "#a5b4fc",
          selectionBackground: "#334155",
        },
      });
      const fitAddon = new fit.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(mountRef.current);
      fitAddon.fit();
      terminalRef.current = terminal;
      fitRef.current = fitAddon;
      terminal.focus();

      inputDisposable = terminal.onData((data) => {
        if (!sessionIdRef.current) return;
        inputRef.current += data;
        if (!inputTimerRef.current) inputTimerRef.current = setTimeout(flushInput, 12);
      });

      resizeObserver = new ResizeObserver(() => {
        if (!mountRef.current || mountRef.current.offsetWidth < 40 || mountRef.current.offsetHeight < 40) return;
        fitAddon.fit();
        if (sessionIdRef.current) void postAction({ type: "resize", cols: terminal.cols, rows: terminal.rows });
      });
      resizeObserver.observe(mountRef.current);

      const id = sessionIdRef.current;
      const source = new EventSource(`/api/admin/terminal/sessions/${encodeURIComponent(id)}/events`);
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
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      inputDisposable?.dispose();
      eventsRef.current?.close();
      eventsRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [disconnect, flushInput, postAction, state]);

  useEffect(() => {
    if (state !== "connected" || minimized) return;
    const frame = requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (!terminal || !mountRef.current || mountRef.current.offsetWidth < 40) return;
      fitRef.current?.fit();
      terminal.focus();
      void postAction({ type: "resize", cols: terminal.cols, rows: terminal.rows });
    });
    return () => cancelAnimationFrame(frame);
  }, [maximized, minimized, postAction, state]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (sessionIdRef.current) await disconnect();
    setState("connecting");
    setMessage("正在建立 SSH 连接…");

    const host = String(form.get("host") ?? "");
    const port = Number(form.get("port") ?? 22);
    const username = String(form.get("username") ?? "");
    const response = await fetch("/api/admin/terminal/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host,
        port,
        username,
        password: authMethod === "password" ? password : undefined,
        privateKey: authMethod === "key" ? privateKey : undefined,
        passphrase: authMethod === "key" && passphrase ? passphrase : undefined,
        hostKeyFingerprint: fingerprint || undefined,
        cols: 120,
        rows: 36,
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
    setConnectionTitle(`${username}@${host}${port === 22 ? "" : `:${port}`}`);
    setPassword("");
    setPrivateKey("");
    setPassphrase("");
    setMinimized(false);
    setMaximized(true);
    setState("connected");
    setMessage(`已连接；主机指纹 ${payload.fingerprint ?? fingerprint}`);
  }

  const connected = state === "connected";
  const busy = state === "connecting";

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl">
        <form onSubmit={connect} className="rounded-[var(--radius-card)] border bg-card p-5 [box-shadow:var(--shadow-sm)] sm:p-6">
          <div className="mb-5 flex items-start gap-3 border-b pb-5">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><SquareTerminal className="size-5" /></span>
            <div className="min-w-0">
              <h2 className="font-semibold">连接 Linux 主机</h2>
              <p className={`mt-1 text-sm ${busy ? "text-amber-600 dark:text-amber-400" : state === "closed" ? "text-destructive" : "text-muted-foreground"}`}>
                {message}
              </p>
            </div>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              主机名或 IP
              <input name="host" required disabled={busy} placeholder="server.example.com" className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
            </label>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                用户名
                <input name="username" required disabled={busy} autoComplete="username" placeholder="root" className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                端口
                <input name="port" type="number" min="1" max="65535" defaultValue="22" required disabled={busy} className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
              </label>
            </div>
            <fieldset disabled={busy} className="grid gap-3">
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
              <input value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} disabled={busy} placeholder="首次连接后显示，核对再重试" className="h-10 rounded-md border bg-background px-3 font-mono text-xs" />
            </label>
            <button type="submit" disabled={busy} className="mt-1 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "连接中…" : "连接"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <section
      className={`fixed z-[100] flex overflow-hidden border border-slate-700 bg-[#070b14] text-slate-100 shadow-2xl transition-[inset,width,height,border-radius] duration-200 ${
        minimized
          ? "right-4 bottom-4 h-11 w-[min(26rem,calc(100vw-2rem))] rounded-lg"
          : maximized
            ? "inset-0 rounded-none"
            : "inset-3 rounded-xl sm:inset-x-[4vw] sm:inset-y-[5vh]"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-11 shrink-0 select-none items-center justify-between gap-4 border-b border-white/10 bg-[#111827] pl-4"
          onDoubleClick={() => { setMinimized(false); setMaximized((value) => !value); }}
        >
          <div className="flex min-w-0 items-center gap-2.5 text-xs text-slate-300">
            <SquareTerminal className="size-4 shrink-0 text-indigo-300" />
            <span className="truncate font-medium text-slate-100">{connectionTitle}</span>
            <span className="hidden items-center gap-1.5 text-slate-400 sm:flex" title={message}>
              <span className="size-1.5 rounded-full bg-emerald-400" />已连接
            </span>
          </div>
          <div className="flex h-full shrink-0 items-stretch" onDoubleClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="最小化" title="最小化" onClick={() => setMinimized(true)} className="grid w-12 place-items-center text-slate-300 hover:bg-white/10 hover:text-white">
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              aria-label={maximized && !minimized ? "还原" : "最大化"}
              title={maximized && !minimized ? "还原" : "最大化"}
              onClick={() => {
                if (minimized) {
                  setMinimized(false);
                  setMaximized(true);
                } else {
                  setMaximized((value) => !value);
                }
              }}
              className="grid w-12 place-items-center text-slate-300 hover:bg-white/10 hover:text-white"
            >
              {maximized && !minimized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
            <button type="button" aria-label="关闭并断开" title="关闭并断开" onClick={() => void disconnect()} className="grid w-12 place-items-center text-slate-300 hover:bg-red-600 hover:text-white">
              <X className="size-4" />
            </button>
          </div>
        </header>
        <div className={minimized ? "hidden" : "min-h-0 flex-1 bg-[#070b14] p-2"}>
          <div ref={mountRef} className="h-full w-full" />
        </div>
      </div>
    </section>
  );
}
