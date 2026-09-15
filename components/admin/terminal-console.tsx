"use client";

import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { ClipboardPaste, Copy, Eraser, Maximize2, Minimize2, Minus, MousePointer2, SquareTerminal, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionState = "idle" | "connecting" | "connected" | "closed";
type ServerEvent = { type: "data"; data: string } | { type: "exit"; message: string };
type WindowRect = { x: number; y: number; width: number; height: number };
type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_UPLOAD_FILES = 5;
const RESIZE_HANDLES: Array<{ direction: ResizeDirection; className: string }> = [
  { direction: "n", className: "top-0 left-3 right-3 h-1.5 cursor-n-resize" },
  { direction: "ne", className: "top-0 right-0 size-3 cursor-ne-resize" },
  { direction: "e", className: "top-3 right-0 bottom-3 w-1.5 cursor-e-resize" },
  { direction: "se", className: "right-0 bottom-0 size-3 cursor-se-resize" },
  { direction: "s", className: "right-3 bottom-0 left-3 h-1.5 cursor-s-resize" },
  { direction: "sw", className: "bottom-0 left-0 size-3 cursor-sw-resize" },
  { direction: "w", className: "top-3 bottom-3 left-0 w-1.5 cursor-w-resize" },
  { direction: "nw", className: "top-0 left-0 size-3 cursor-nw-resize" },
];

function defaultWindowRect(): WindowRect {
  const margin = window.innerWidth < 640 ? 8 : 24;
  return {
    x: margin,
    y: margin,
    width: Math.max(320, window.innerWidth - margin * 2),
    height: Math.max(300, window.innerHeight - margin * 2),
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function TerminalConsole() {
  const windowRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventsRef = useRef<EventSource | null>(null);
  const inputRef = useRef("");
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputSendingRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResizeRef = useRef("");
  const decoderRef = useRef(new TextDecoder());
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [windowRect, setWindowRect] = useState<WindowRect>({ x: 24, y: 24, width: 960, height: 640 });
  const [windowInteracting, setWindowInteracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);

  const postAction = useCallback(async (body: object) => {
    const id = sessionIdRef.current;
    if (!id) return;
    const response = await fetch(`/api/admin/terminal/sessions/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("终端操作请求失败。");
  }, []);

  const flushInput = useCallback(function drainInput() {
    inputTimerRef.current = null;
    if (inputSendingRef.current) return;
    const data = inputRef.current;
    if (!data || !sessionIdRef.current) return;
    inputRef.current = "";
    inputSendingRef.current = true;
    void postAction({ type: "input", data })
      .catch(() => setMessage("终端输入发送失败，请检查连接。"))
      .finally(() => {
        inputSendingRef.current = false;
        if (sessionIdRef.current && inputRef.current && !inputTimerRef.current) {
          inputTimerRef.current = setTimeout(drainInput, 0);
        }
      });
  }, [postAction]);

  const scheduleTerminalResize = useCallback((terminal: Terminal) => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      resizeTimerRef.current = null;
      const size = `${terminal.cols}x${terminal.rows}`;
      if (!sessionIdRef.current || size === lastResizeRef.current) return;
      lastResizeRef.current = size;
      void postAction({ type: "resize", cols: terminal.cols, rows: terminal.rows })
        .catch(() => setMessage("终端尺寸同步失败，连接可能不稳定。"));
    }, 150);
  }, [postAction]);

  const disconnect = useCallback(async (notifyServer = true) => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    eventsRef.current?.close();
    eventsRef.current = null;
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
    inputTimerRef.current = null;
    inputRef.current = "";
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
    resizeFrameRef.current = null;
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = null;
    lastResizeRef.current = "";
    if (notifyServer && id) {
      await fetch(`/api/admin/terminal/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    }
    setMinimized(false);
    setMaximized(false);
    setDragActive(false);
    setContextMenu(null);
    setState("closed");
  }, []);

  const copySelection = useCallback(async () => {
    const terminal = terminalRef.current;
    const selection = terminal?.getSelection() ?? "";
    setContextMenu(null);
    if (!selection) {
      setMessage("请先选择需要复制的终端内容。");
      terminal?.focus();
      return;
    }
    try {
      await navigator.clipboard.writeText(selection);
      setMessage("已复制终端选区到电脑剪贴板。");
    } catch {
      setMessage("浏览器未允许写入剪贴板，请检查站点权限。");
    }
    terminal?.focus();
  }, []);

  const pasteClipboard = useCallback(async () => {
    const terminal = terminalRef.current;
    setContextMenu(null);
    if (!terminal) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        terminal.paste(text);
        setMessage("已将电脑剪贴板内容粘贴到终端。");
      }
    } catch {
      setMessage("浏览器未允许读取剪贴板，请检查站点权限。");
    }
    terminal.focus();
  }, []);

  const uploadFiles = useCallback(async (items: FileList | File[]) => {
    const id = sessionIdRef.current;
    const files = Array.from(items).filter((file) => file.size > 0);
    setContextMenu(null);
    setDragActive(false);
    if (!id || files.length === 0) return;
    if (files.length > MAX_UPLOAD_FILES) {
      setMessage(`一次最多上传 ${MAX_UPLOAD_FILES} 个文件。`);
      return;
    }
    const oversized = files.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      setMessage(`${oversized.name} 超过 24 MiB，未开始上传。`);
      return;
    }

    setUploading(true);
    try {
      for (const [index, file] of files.entries()) {
        setMessage(`正在上传 ${index + 1}/${files.length}：${file.name}（${formatBytes(file.size)}）`);
        const response = await fetch(`/api/admin/terminal/sessions/${encodeURIComponent(id)}/upload?name=${encodeURIComponent(file.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        }).catch(() => null);
        if (!response) throw new Error("网络请求失败。");
        const payload = await response.json().catch(() => ({})) as { path?: string; bytes?: number; error?: string };
        if (!response.ok || !payload.path) throw new Error(payload.error ?? "文件上传失败。");
        terminalRef.current?.writeln(`\r\n\x1b[38;5;114m上传完成：${payload.path}（${formatBytes(payload.bytes ?? file.size)}）\x1b[0m`);
      }
      setMessage(`${files.length} 个文件已上传到远端用户主目录。`);
    } catch (error) {
      const uploadError = error instanceof Error ? error.message : "文件上传失败。";
      setMessage(uploadError);
      terminalRef.current?.writeln(`\r\n\x1b[38;5;203m上传失败：${uploadError}\x1b[0m`);
    } finally {
      setUploading(false);
      terminalRef.current?.focus();
    }
  }, []);

  const trackPointer = useCallback((
    cursor: string,
    onMove: (event: PointerEvent) => void,
    onEnd?: () => void,
  ) => {
    setWindowInteracting(true);
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      onEnd?.();
      setWindowInteracting(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    window.addEventListener("blur", finish, { once: true });
  }, []);

  const beginWindowDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || minimized) return;
    event.preventDefault();
    const startPointer = { x: event.clientX, y: event.clientY };
    let startRect = windowRect;
    if (maximized) {
      const restored = defaultWindowRect();
      const horizontalRatio = Math.min(1, Math.max(0, event.clientX / window.innerWidth));
      restored.x = Math.min(window.innerWidth - restored.width, Math.max(0, event.clientX - restored.width * horizontalRatio));
      restored.y = 0;
      startRect = restored;
      setWindowRect(restored);
      setMaximized(false);
    }
    let latestRect = startRect;
    let paintFrame: number | null = null;
    const paintRect = () => {
      paintFrame = null;
      const element = windowRef.current;
      if (!element) return;
      element.style.left = `${latestRect.x}px`;
      element.style.top = `${latestRect.y}px`;
      element.style.width = `${latestRect.width}px`;
      element.style.height = `${latestRect.height}px`;
    };
    const schedulePaint = () => {
      if (paintFrame === null) paintFrame = requestAnimationFrame(paintRect);
    };
    trackPointer("move", (moveEvent) => {
      const x = Math.min(window.innerWidth - startRect.width, Math.max(0, startRect.x + moveEvent.clientX - startPointer.x));
      const y = Math.min(window.innerHeight - startRect.height, Math.max(0, startRect.y + moveEvent.clientY - startPointer.y));
      latestRect = { ...startRect, x, y };
      schedulePaint();
    }, () => {
      if (paintFrame !== null) cancelAnimationFrame(paintFrame);
      paintRect();
      setWindowRect(latestRect);
    });
  }, [maximized, minimized, trackPointer, windowRect]);

  const beginWindowResize = useCallback((direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || minimized || maximized) return;
    event.preventDefault();
    event.stopPropagation();
    const startPointer = { x: event.clientX, y: event.clientY };
    const startRect = windowRect;
    const minWidth = Math.min(480, window.innerWidth);
    const minHeight = Math.min(300, window.innerHeight);
    let latestRect = startRect;
    let paintFrame: number | null = null;
    const paintRect = () => {
      paintFrame = null;
      const element = windowRef.current;
      if (!element) return;
      element.style.left = `${latestRect.x}px`;
      element.style.top = `${latestRect.y}px`;
      element.style.width = `${latestRect.width}px`;
      element.style.height = `${latestRect.height}px`;
    };
    const schedulePaint = () => {
      if (paintFrame === null) paintFrame = requestAnimationFrame(paintRect);
    };
    trackPointer(getComputedStyle(event.currentTarget).cursor, (moveEvent) => {
      const dx = moveEvent.clientX - startPointer.x;
      const dy = moveEvent.clientY - startPointer.y;
      let { x, y, width, height } = startRect;
      if (direction.includes("e")) width = Math.min(window.innerWidth - x, Math.max(minWidth, startRect.width + dx));
      if (direction.includes("s")) height = Math.min(window.innerHeight - y, Math.max(minHeight, startRect.height + dy));
      if (direction.includes("w")) {
        x = Math.min(startRect.x + startRect.width - minWidth, Math.max(0, startRect.x + dx));
        width = startRect.width + startRect.x - x;
      }
      if (direction.includes("n")) {
        y = Math.min(startRect.y + startRect.height - minHeight, Math.max(0, startRect.y + dy));
        height = startRect.height + startRect.y - y;
      }
      latestRect = { x, y, width, height };
      schedulePaint();
    }, () => {
      if (paintFrame !== null) cancelAnimationFrame(paintFrame);
      paintRect();
      setWindowRect(latestRect);
    });
  }, [maximized, minimized, trackPointer, windowRect]);

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

      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;
        const modified = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (modified && key === "v") {
          void pasteClipboard();
          return false;
        }
        if (modified && key === "c" && terminal.hasSelection()) {
          void copySelection();
          return false;
        }
        return true;
      });

      inputDisposable = terminal.onData((data) => {
        if (!sessionIdRef.current) return;
        inputRef.current += data;
        if (!inputTimerRef.current) inputTimerRef.current = setTimeout(flushInput, 0);
      });

      resizeObserver = new ResizeObserver(() => {
        if (!mountRef.current || mountRef.current.offsetWidth < 40 || mountRef.current.offsetHeight < 40) return;
        if (resizeFrameRef.current !== null) return;
        resizeFrameRef.current = requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          if (!mountRef.current || mountRef.current.offsetWidth < 40 || mountRef.current.offsetHeight < 40) return;
          fitAddon.fit();
          scheduleTerminalResize(terminal);
        });
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
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
      inputDisposable?.dispose();
      eventsRef.current?.close();
      eventsRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [copySelection, disconnect, flushInput, pasteClipboard, scheduleTerminalResize, state]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", closeOnKey);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", closeOnKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (state !== "connected" || minimized) return;
    const frame = requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (!terminal || !mountRef.current || mountRef.current.offsetWidth < 40) return;
      fitRef.current?.fit();
      terminal.focus();
      scheduleTerminalResize(terminal);
    });
    return () => cancelAnimationFrame(frame);
  }, [maximized, minimized, scheduleTerminalResize, state]);

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
    setMaximized(false);
    setWindowRect(defaultWindowRect());
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
    <>
      <section
        ref={windowRef}
        className={`fixed z-[100] flex overflow-hidden border border-slate-700 bg-[#070b14] text-slate-100 shadow-2xl ${windowInteracting ? "transition-none" : "transition-[inset,width,height,border-radius] duration-200"} ${
          minimized
            ? "right-4 bottom-4 h-11 w-[min(26rem,calc(100vw-2rem))] rounded-lg"
            : maximized
              ? "inset-0 rounded-none"
              : "rounded-xl"
        }`}
        style={!minimized && !maximized ? {
          left: windowRect.x,
          top: windowRect.y,
          width: windowRect.width,
          height: windowRect.height,
        } : undefined}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="flex h-11 shrink-0 touch-none cursor-move select-none items-center justify-between gap-4 border-b border-white/10 bg-[#111827] pl-4"
            onPointerDown={beginWindowDrag}
            onDoubleClick={() => { setMinimized(false); setMaximized((value) => !value); }}
          >
          <div className="flex min-w-0 items-center gap-2.5 text-xs text-slate-300">
            <SquareTerminal className="size-4 shrink-0 text-indigo-300" />
            <span className="truncate font-medium text-slate-100">{connectionTitle}</span>
            <span className="hidden items-center gap-1.5 text-slate-400 sm:flex" title={message}>
              {uploading ? <UploadCloud className="size-3.5 animate-pulse text-indigo-300" /> : <span className="size-1.5 rounded-full bg-emerald-400" />}
              {uploading ? "上传中" : "已连接"}
            </span>
          </div>
          <div className="flex h-full shrink-0 items-stretch" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
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
          <div
            className={minimized ? "hidden" : "relative min-h-0 flex-1 bg-[#070b14] p-2"}
            onContextMenu={(event) => {
              event.preventDefault();
              terminalRef.current?.focus();
              setContextMenu({
                x: Math.max(8, Math.min(event.clientX, window.innerWidth - 216)),
                y: Math.max(8, Math.min(event.clientY, window.innerHeight - 232)),
                hasSelection: terminalRef.current?.hasSelection() ?? false,
              });
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (event.dataTransfer.types.includes("Files")) setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              void uploadFiles(event.dataTransfer.files);
            }}
          >
            <div ref={mountRef} className="h-full w-full" />
            {dragActive ? (
              <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-lg border-2 border-dashed border-indigo-400 bg-indigo-950/90 text-center backdrop-blur-sm">
                <div>
                  <UploadCloud className="mx-auto size-10 text-indigo-300" />
                  <p className="mt-3 font-semibold text-white">松开以上传到远端 ~/</p>
                  <p className="mt-1 text-xs text-indigo-200">最多 5 个文件，单个不超过 24 MiB，不覆盖同名文件</p>
                </div>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        </div>
        {!minimized && !maximized ? RESIZE_HANDLES.map(({ direction, className }) => (
          <div
            key={direction}
            aria-hidden="true"
            className={`absolute z-20 touch-none ${className}`}
            onPointerDown={(event) => beginWindowResize(direction, event)}
          />
        )) : null}
      </section>

      {contextMenu ? (
        <div
          role="menu"
          aria-label="终端菜单"
          className="fixed z-[110] w-52 overflow-hidden rounded-lg border border-slate-700 bg-[#111827] p-1.5 text-sm text-slate-100 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void copySelection()} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10 disabled:opacity-40">
            <Copy className="size-4" /><span className="flex-1">复制</span><kbd className="text-[10px] text-slate-400">Ctrl+C</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => void pasteClipboard()} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10">
            <ClipboardPaste className="size-4" /><span className="flex-1">粘贴</span><kbd className="text-[10px] text-slate-400">Ctrl+V</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => { terminalRef.current?.selectAll(); setContextMenu(null); terminalRef.current?.focus(); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10">
            <MousePointer2 className="size-4" /><span>全选终端内容</span>
          </button>
          <div className="my-1 border-t border-white/10" />
          <button type="button" role="menuitem" disabled={uploading} onClick={() => { setContextMenu(null); fileInputRef.current?.click(); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10 disabled:opacity-40">
            <UploadCloud className="size-4" /><span>上传文件到 ~/</span>
          </button>
          <button type="button" role="menuitem" onClick={() => { terminalRef.current?.clear(); setContextMenu(null); terminalRef.current?.focus(); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10">
            <Eraser className="size-4" /><span>清屏</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
