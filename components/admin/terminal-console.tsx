"use client";

import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { ClipboardPaste, Copy, Eraser, Keyboard, KeyboardOff, Maximize2, Minimize2, Minus, MousePointer2, Palette, SquareTerminal, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalAppearancePanel } from "@/components/admin/terminal-appearance-panel";
import {
  clearBackgroundImage,
  loadAppearance,
  loadBackgroundImage,
  saveAppearance,
  saveBackgroundImage,
} from "@/components/admin/terminal-appearance-store";
import { deleteConnection, saveConnection, useSavedConnections } from "@/components/admin/terminal-connection-store";
import { TerminalSavedConnections } from "@/components/admin/terminal-saved-connections";
import {
  DEFAULT_APPEARANCE,
  MAX_BACKGROUND_IMAGE_BYTES,
  normalizeAppearance,
  terminalTheme,
  type TerminalAppearance,
} from "@/lib/terminal/appearance";
import { splitTerminalInput } from "@/lib/terminal/input-chunks";
import { shouldBlockBrowserDefault, terminalKeyAction } from "@/lib/terminal/key-policy";
import { connectionKey, type AuthMethod, type SavedConnection } from "@/lib/terminal/saved-connections";

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

type ConnectionDraft = { host: string; port: string; username: string; authMethod: AuthMethod; fingerprint: string };

const EMPTY_DRAFT: ConnectionDraft = { host: "", port: "22", username: "", authMethod: "password", fingerprint: "" };

function draftFromSaved(connection: SavedConnection): ConnectionDraft {
  return {
    host: connection.host,
    port: String(connection.port),
    username: connection.username,
    authMethod: connection.authMethod,
    fingerprint: connection.fingerprint,
  };
}

function defaultWindowRect(): WindowRect {
  const margin = window.innerWidth < 640 ? 8 : 24;
  return {
    x: margin,
    y: margin,
    width: Math.max(320, window.innerWidth - margin * 2),
    height: Math.max(300, window.innerHeight - margin * 2),
  };
}

const TITLE_BAR_HEIGHT = 44;
/** 标题栏至少留这么宽在视窗里，窗口拖到边外也总能拖回来。 */
const MIN_VISIBLE_TITLE_WIDTH = 160;
/** 按下后移动超过这个距离才算拖动；单击、双击标题栏都不应该挪动或还原窗口。 */
const DRAG_THRESHOLD = 4;
/** 拖动时指针贴到视窗顶边这么近，松手就最大化。 */
const SNAP_EDGE = 2;

/** 像系统窗口一样允许部分移出视窗，只保证标题栏可见、可抓。 */
function keepTitleBarReachable(rect: WindowRect): WindowRect {
  const x = Math.min(window.innerWidth - MIN_VISIBLE_TITLE_WIDTH, Math.max(MIN_VISIBLE_TITLE_WIDTH - rect.width, rect.x));
  const y = Math.min(window.innerHeight - TITLE_BAR_HEIGHT, Math.max(0, rect.y));
  return x === rect.x && y === rect.y ? rect : { ...rect, x, y };
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
  const inputSequenceRef = useRef(0);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResizeRef = useRef("");
  const decoderRef = useRef(new TextDecoder());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [message, setMessage] = useState("填写目标主机后连接。");
  const [connectionTitle, setConnectionTitle] = useState("Linux shell");
  const savedConnections = useSavedConnections();
  // 还没动过表单时默认填最近用过的连接；一旦修改或选了别的连接，就以 draftOverride 为准。
  const [draftOverride, setDraftOverride] = useState<ConnectionDraft | null>(null);
  const draft = draftOverride ?? (savedConnections[0] ? draftFromSaved(savedConnections[0]) : EMPTY_DRAFT);
  const { authMethod, fingerprint } = draft;
  const [rememberThisConnection, setRememberThisConnection] = useState(true);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const privateKeyInputRef = useRef<HTMLTextAreaElement>(null);
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(true);
  const [windowRect, setWindowRect] = useState<WindowRect>({ x: 24, y: 24, width: 960, height: 640 });
  const [windowInteracting, setWindowInteracting] = useState(false);
  const [snapPreview, setSnapPreview] = useState(false);
  const [keyboardLocked, setKeyboardLocked] = useState(false);
  const keyboardLockedRef = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);
  // 背景设置只影响连接后的终端窗口，首屏渲染的是连接表单，所以初始化时直接读本地存储不会造成水合不一致。
  const [appearance, setAppearance] = useState<TerminalAppearance>(() => (
    typeof window === "undefined" ? DEFAULT_APPEARANCE : loadAppearance()
  ));
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceNotice, setAppearanceNotice] = useState("");
  const themeRef = useRef(terminalTheme(appearance, false));
  const appearanceRef = useRef(appearance);
  const lastPasteRef = useRef({ text: "", at: 0 });

  const postAction = useCallback(async (body: object, sessionId = sessionIdRef.current) => {
    const id = sessionId;
    if (!id) return;
    const response = await fetch(`/api/admin/terminal/sessions/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("终端操作请求失败。");
  }, []);

  const flushInput = useCallback(() => {
    inputTimerRef.current = null;
    const pending = inputRef.current;
    const sessionId = sessionIdRef.current;
    if (!pending || !sessionId) return;
    inputRef.current = "";
    // 粘贴一大段文本会超过服务端单次 16 KiB 的上限，切开分批发；序号保证顺序。
    for (const data of splitTerminalInput(pending)) {
      const sequence = inputSequenceRef.current++;
      const send = (attempt: number) => {
        if (sessionIdRef.current !== sessionId) return;
        void postAction({ type: "input", data, sequence }, sessionId).catch(() => {
          if (attempt < 2 && sessionIdRef.current === sessionId) {
            setTimeout(() => send(attempt + 1), 80 * (attempt + 1));
            return;
          }
          if (sessionIdRef.current === sessionId) setMessage("终端输入传输中断，请重新连接。");
        });
      };
      send(0);
    }
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
    inputSequenceRef.current = 0;
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
    navigator.keyboard?.unlock();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    // 服务端主动断开时调用方已经写好了原因，这里只处理用户自己关掉的情况。
    if (notifyServer) setMessage("已断开连接。");
    setState("closed");
  }, []);

  // 浏览器把 Ctrl+T、Ctrl+W、Ctrl+N 这些快捷键留给自己，页面里 preventDefault 也拦不住。
  // 只有全屏 + Keyboard Lock 时才会把它们交给页面，再由 xterm 发给远端。
  const enterKeyboardLock = useCallback(async () => {
    const element = windowRef.current;
    if (!element) return;
    if (!navigator.keyboard?.lock) {
      setMessage("这个浏览器不支持独占键盘，换 Chrome 或 Edge 桌面版可以。");
      return;
    }
    try {
      await element.requestFullscreen();
      await navigator.keyboard.lock();
      setMinimized(false);
      setMaximized(true);
      setMessage("已独占键盘：Ctrl+T、Ctrl+W 等快捷键都会发给远端；按住 Esc 一秒退出全屏。");
      terminalRef.current?.focus();
    } catch {
      setMessage("进入全屏失败，无法独占键盘。");
    }
  }, []);

  const exitKeyboardLock = useCallback(() => {
    navigator.keyboard?.unlock();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
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

  /**
   * 所有粘贴都从这里进终端。source 为 "native" 的是浏览器自己的 paste 事件：
   * 我们按下 Ctrl+V 时已经 preventDefault，正常不会再触发；万一哪天拦不住，
   * 紧跟在自己粘贴之后的这一次就忽略掉，不会粘两遍。用户连按两次粘贴不受影响。
   */
  const insertPaste = useCallback((text: string, source: "own" | "native" = "own") => {
    const terminal = terminalRef.current;
    if (!terminal || !text) return;
    const now = performance.now();
    if (source === "native" && now - lastPasteRef.current.at < 300) return;
    lastPasteRef.current = { text, at: now };
    terminal.paste(text);
  }, []);

  const pasteClipboard = useCallback(async () => {
    const terminal = terminalRef.current;
    setContextMenu(null);
    if (!terminal) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        insertPaste(text);
        setMessage("已将电脑剪贴板内容粘贴到终端。");
      }
    } catch {
      setMessage("浏览器未允许读取剪贴板，请检查站点权限。");
    }
    terminal.focus();
  }, [insertPaste]);

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
    const restoreRect = windowRect;
    let startRect = windowRect;
    let dragging = false;
    let snapping = false;
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
      const dx = moveEvent.clientX - startPointer.x;
      const dy = moveEvent.clientY - startPointer.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        if (maximized) {
          // 从最大化拖出来：恢复上次的窗口大小，指针保持在标题栏里相同的横向比例处。
          const ratio = Math.min(1, Math.max(0, startPointer.x / window.innerWidth));
          startRect = { ...restoreRect, x: startPointer.x - restoreRect.width * ratio, y: 0 };
          setWindowRect(startRect);
          setMaximized(false);
        }
      }
      latestRect = keepTitleBarReachable({ ...startRect, x: startRect.x + dx, y: startRect.y + dy });
      const nextSnapping = moveEvent.clientY <= SNAP_EDGE;
      if (nextSnapping !== snapping) {
        snapping = nextSnapping;
        setSnapPreview(nextSnapping);
      }
      schedulePaint();
    }, () => {
      if (paintFrame !== null) cancelAnimationFrame(paintFrame);
      if (!dragging) return;
      if (snapping) {
        // 贴顶松手最大化；还原时回到拖动前的位置，而不是贴在顶边的那个位置。
        setSnapPreview(false);
        setWindowRect(keepTitleBarReachable(restoreRect));
        setMaximized(true);
        return;
      }
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
      // 指针本身出不了视窗，边框自然跟着停在视窗边上；窗口已部分移出视窗时也不强行拉回。
      if (direction.includes("e")) width = Math.max(minWidth, startRect.width + dx);
      if (direction.includes("s")) height = Math.max(minHeight, startRect.height + dy);
      if (direction.includes("w")) {
        x = Math.min(startRect.x + startRect.width - minWidth, startRect.x + dx);
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

  // 退出全屏的方式很多（按住 Esc、F11、系统手势），统一以 fullscreenchange 为准。
  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement !== null && document.fullscreenElement === windowRef.current;
      if (keyboardLockedRef.current && !active) setMessage("已退出独占键盘。");
      keyboardLockedRef.current = active;
      setKeyboardLocked(active);
      if (!active) navigator.keyboard?.unlock();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      navigator.keyboard?.unlock();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadBackgroundImage().then((image) => {
      if (!cancelled && image) setBackgroundUrl(URL.createObjectURL(image));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); }, [backgroundUrl]);

  useEffect(() => {
    const theme = terminalTheme(appearance, Boolean(backgroundUrl));
    themeRef.current = theme;
    appearanceRef.current = appearance;
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.theme = theme;
      if (terminal.options.fontSize !== appearance.fontSize) {
        terminal.options.fontSize = appearance.fontSize;
        fitRef.current?.fit();
      }
    }
  }, [appearance, backgroundUrl]);

  const updateAppearance = useCallback((patch: Partial<TerminalAppearance>) => {
    setAppearance((current) => {
      const next = normalizeAppearance({ ...current, ...patch });
      saveAppearance(next);
      return next;
    });
  }, []);

  const pickBackgroundImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setAppearanceNotice("请选择图片文件。");
      return;
    }
    if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
      setAppearanceNotice("图片超过 20 MiB，请换一张小一点的。");
      return;
    }
    try {
      // 先确认浏览器解得开（比如部分浏览器不支持 HEIC），免得存下一张显示不出来的图。
      (await createImageBitmap(file)).close();
    } catch {
      setAppearanceNotice("浏览器无法显示这张图片，请换 JPG、PNG 或 WebP。");
      return;
    }
    setBackgroundUrl(URL.createObjectURL(file));
    const saved = await saveBackgroundImage(file);
    setAppearanceNotice(saved ? "" : "浏览器没有允许保存图片，刷新页面后需要重新选择。");
  }, []);

  /** delta 为 0 表示恢复默认字号。 */
  const adjustFontSize = useCallback((delta: number) => {
    const current = appearanceRef.current.fontSize;
    const next = delta === 0 ? DEFAULT_APPEARANCE.fontSize : current + delta;
    if (next === current) return;
    setAppearance((value) => {
      const updated = normalizeAppearance({ ...value, fontSize: delta === 0 ? DEFAULT_APPEARANCE.fontSize : value.fontSize + delta });
      saveAppearance(updated);
      return updated;
    });
  }, []);

  const removeBackgroundImage = useCallback(() => {
    setBackgroundUrl(null);
    setAppearanceNotice("");
    void clearBackgroundImage();
  }, []);

  const closeAppearance = useCallback(() => {
    setAppearanceOpen(false);
    terminalRef.current?.focus();
  }, []);

  // 浏览器窗口缩小后，把跑到视窗外的终端窗口的标题栏拉回可见范围。
  useEffect(() => {
    const onResize = () => setWindowRect((rect) => keepTitleBarReachable(rect));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (state !== "connected" || !mountRef.current || !sessionIdRef.current) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let inputDisposable: { dispose(): void } | undefined;
    let cleanupSurface: (() => void) | undefined;

    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([xterm, fit]) => {
      if (disposed || !mountRef.current || !sessionIdRef.current) return;
      const terminal = new xterm.Terminal({
        cursorBlink: true,
        convertEol: false,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: appearanceRef.current.fontSize,
        lineHeight: 1.15,
        scrollback: 5_000,
        // 背景由外层容器画（纯色或图片），终端本身透明。
        allowTransparency: true,
        theme: themeRef.current,
      });
      const fitAddon = new fit.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(mountRef.current);
      fitAddon.fit();
      terminalRef.current = terminal;
      fitRef.current = fitAddon;
      terminal.focus();

      const apple = /mac|iphone|ipad/i.test(navigator.userAgent);
      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;
        // 终端有焦点时，浏览器的默认动作一律拦掉（拦得住的那些），由终端自己决定怎么处理。
        if (shouldBlockBrowserDefault(event)) event.preventDefault();
        switch (terminalKeyAction(event, apple)) {
          case "copy": void copySelection(); return false;
          case "paste": void pasteClipboard(); return false;
          case "font-in": adjustFontSize(1); return false;
          case "font-out": adjustFontSize(-1); return false;
          case "font-reset": adjustFontSize(0); return false;
          default: return true;
        }
      });

      const surface = mountRef.current;
      // 选中即复制：松开鼠标时把选区送进电脑剪贴板，不用再按快捷键。
      const copyOnRelease = () => {
        setTimeout(() => {
          const selection = terminal.getSelection();
          if (selection) void navigator.clipboard.writeText(selection).catch(() => undefined);
        }, 0);
      };
      // 浏览器自己的粘贴事件也收归一处，避免 xterm 再插一遍。
      const onNativePaste = (event: ClipboardEvent) => {
        event.preventDefault();
        event.stopPropagation();
        insertPaste(event.clipboardData?.getData("text") ?? "", "native");
      };
      // Ctrl+滚轮本来是缩放整个网页，改成调终端字号。
      const onWheel = (event: WheelEvent) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        adjustFontSize(event.deltaY < 0 ? 1 : -1);
      };
      surface.addEventListener("pointerup", copyOnRelease);
      surface.addEventListener("paste", onNativePaste, true);
      surface.addEventListener("wheel", onWheel, { passive: false });
      cleanupSurface = () => {
        surface.removeEventListener("pointerup", copyOnRelease);
        surface.removeEventListener("paste", onNativePaste, true);
        surface.removeEventListener("wheel", onWheel);
      };

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

      // OSC 52：tmux（需要 set -g set-clipboard on）、vim 在远端复制时，把内容同步到电脑剪贴板。
      // 只接受写入，远端读取剪贴板的请求一律忽略，免得把本机剪贴板泄露出去。
      terminal.parser.registerOscHandler(52, (data) => {
        const payload = data.slice(data.indexOf(";") + 1);
        if (!payload || payload === "?" || payload.length > 4_000_000) return true;
        try {
          const text = new TextDecoder().decode(Uint8Array.from(atob(payload), (character) => character.charCodeAt(0)));
          if (text) {
            void navigator.clipboard.writeText(text).catch(() => undefined);
            setMessage("远端复制的内容已同步到电脑剪贴板。");
          }
        } catch {
          // 不是合法 base64，忽略。
        }
        return true;
      });

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
      cleanupSurface?.();
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
  }, [adjustFontSize, copySelection, disconnect, flushInput, insertPaste, pasteClipboard, scheduleTerminalResize, state]);

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
    const submitted = draft;
    if (sessionIdRef.current) await disconnect();
    setState("connecting");
    setMessage("正在建立 SSH 连接…");

    const host = submitted.host.trim();
    const port = Number(submitted.port);
    const username = submitted.username;
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
      if (payload.fingerprint) setDraftOverride({ ...submitted, fingerprint: payload.fingerprint });
      setState("closed");
      setMessage(payload.error ?? "SSH 连接失败。");
      return;
    }

    sessionIdRef.current = payload.id;
    // 记下这次核对通过的指纹：下次从常用连接里选它，可以直接连上，不用再确认一遍。
    const verifiedFingerprint = payload.fingerprint ?? submitted.fingerprint;
    setDraftOverride({ ...submitted, host, fingerprint: verifiedFingerprint });
    if (rememberThisConnection) {
      saveConnection({ host, port, username, authMethod: submitted.authMethod, fingerprint: verifiedFingerprint, lastUsedAt: Date.now() });
    }
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
  const draftKey = connectionKey({ host: draft.host, port: Number(draft.port), username: draft.username });
  const selectedConnectionKey = savedConnections.some((connection) => connectionKey(connection) === draftKey) ? draftKey : "";

  function updateDraft(patch: Partial<ConnectionDraft>) {
    setDraftOverride({ ...draft, ...patch });
  }

  function pickConnection(connection: SavedConnection) {
    setDraftOverride(draftFromSaved(connection));
    setPassword("");
    setPrivateKey("");
    setPassphrase("");
    requestAnimationFrame(() => {
      (connection.authMethod === "key" ? privateKeyInputRef.current : passwordInputRef.current)?.focus();
    });
  }

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
          <TerminalSavedConnections
            connections={savedConnections}
            selectedKey={selectedConnectionKey}
            disabled={busy}
            onPick={pickConnection}
            onDelete={deleteConnection}
            onClear={() => {
              setDraftOverride(EMPTY_DRAFT);
              setPassword("");
              setPrivateKey("");
              setPassphrase("");
            }}
          />
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              主机名或 IP
              <input name="host" value={draft.host} onChange={(event) => updateDraft({ host: event.target.value })} required disabled={busy} placeholder="server.example.com" className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
            </label>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                用户名
                <input name="username" value={draft.username} onChange={(event) => updateDraft({ username: event.target.value })} required disabled={busy} autoComplete="username" placeholder="root" className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                端口
                <input name="port" type="number" min="1" max="65535" value={draft.port} onChange={(event) => updateDraft({ port: event.target.value })} required disabled={busy} className="h-10 rounded-md border bg-background px-3 font-mono text-sm" />
              </label>
            </div>
            <fieldset disabled={busy} className="grid gap-3">
              <legend className="mb-2 text-sm font-medium">登录方式</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={authMethod === "password"} onChange={() => updateDraft({ authMethod: "password" })} />密码</label>
                <label className="flex items-center gap-2"><input type="radio" checked={authMethod === "key"} onChange={() => updateDraft({ authMethod: "key" })} />私钥</label>
              </div>
              {authMethod === "password" ? (
                <label className="grid gap-1.5 text-sm font-medium">
                  密码
                  <input ref={passwordInputRef} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="h-10 rounded-md border bg-background px-3" />
                </label>
              ) : (
                <>
                  <label className="grid gap-1.5 text-sm font-medium">
                    OpenSSH 私钥
                    <textarea ref={privateKeyInputRef} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} required rows={7} spellCheck={false} className="rounded-md border bg-background p-3 font-mono text-xs" />
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
              <input value={fingerprint} onChange={(event) => updateDraft({ fingerprint: event.target.value })} disabled={busy} placeholder="首次连接后显示，核对再重试" className="h-10 rounded-md border bg-background px-3 font-mono text-xs" />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={rememberThisConnection} onChange={(event) => setRememberThisConnection(event.target.checked)} disabled={busy} />
              连接成功后保存到常用连接（不保存密码和私钥）
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
            <button
              type="button"
              aria-label={keyboardLocked ? "退出独占键盘" : "独占键盘（全屏）"}
              title={keyboardLocked ? "退出独占键盘" : "独占键盘：全屏后 Ctrl+T、Ctrl+W 等发给远端"}
              aria-pressed={keyboardLocked}
              onClick={() => { if (keyboardLocked) exitKeyboardLock(); else void enterKeyboardLock(); }}
              className={`grid w-12 place-items-center hover:bg-white/10 hover:text-white ${keyboardLocked ? "bg-indigo-500/80 text-white" : "text-slate-300"}`}
            >
              {keyboardLocked ? <KeyboardOff className="size-4" /> : <Keyboard className="size-4" />}
            </button>
            <button
              type="button"
              data-appearance-toggle
              aria-label="终端背景"
              title="终端背景"
              aria-expanded={appearanceOpen}
              onClick={() => {
                setMinimized(false);
                setAppearanceOpen((open) => !open);
              }}
              className={`grid w-12 place-items-center hover:bg-white/10 hover:text-white ${appearanceOpen ? "bg-white/10 text-white" : "text-slate-300"}`}
            >
              <Palette className="size-4" />
            </button>
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
            className={minimized ? "hidden" : "relative min-h-0 flex-1 p-2"}
            style={{ backgroundColor: appearance.color }}
            onMouseDown={(event) => {
              // 中键粘贴（X11 习惯），顺便挡掉浏览器的中键自动滚动。
              if (event.button !== 1) return;
              event.preventDefault();
              void pasteClipboard();
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              terminalRef.current?.focus();
              // 右键直接粘贴；按住 Shift 再右键才出菜单。
              if (!event.shiftKey) {
                void pasteClipboard();
                return;
              }
              setContextMenu({
                x: Math.max(8, Math.min(event.clientX, window.innerWidth - 216)),
                y: Math.max(8, Math.min(event.clientY, window.innerHeight - 272)),
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
            {backgroundUrl ? (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div
                    className="absolute"
                    style={{
                      // 模糊会把边缘羽化成半透明，往外多铺一圈再由外层裁掉。
                      inset: -appearance.blur * 2,
                      backgroundImage: `url("${backgroundUrl}")`,
                      backgroundPosition: "center",
                      backgroundRepeat: appearance.fit === "tile" ? "repeat" : "no-repeat",
                      backgroundSize: appearance.fit === "tile" ? "auto" : appearance.fit,
                      filter: appearance.blur ? `blur(${appearance.blur}px)` : undefined,
                    }}
                  />
                </div>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundColor: `rgb(0 0 0 / ${appearance.dim}%)` }} />
              </>
            ) : null}
            <div ref={mountRef} className="terminal-surface relative h-full w-full" />
            {appearanceOpen ? (
              <TerminalAppearancePanel
                appearance={appearance}
                hasImage={Boolean(backgroundUrl)}
                notice={appearanceNotice}
                onChange={updateAppearance}
                onPickImage={(file) => void pickBackgroundImage(file)}
                onRemoveImage={removeBackgroundImage}
                onReset={() => {
                  updateAppearance(DEFAULT_APPEARANCE);
                  removeBackgroundImage();
                }}
                onClose={closeAppearance}
              />
            ) : null}
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

      {snapPreview ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-1.5 z-[99] rounded-lg border-2 border-indigo-400/70 bg-indigo-400/10 backdrop-blur-[1px] motion-safe:animate-[overlay-in_120ms_ease-out]" />
      ) : null}

      {contextMenu ? (
        <div
          role="menu"
          aria-label="终端菜单"
          className="fixed z-[110] w-52 overflow-hidden rounded-lg border border-slate-700 bg-[#111827] p-1.5 text-sm text-slate-100 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void copySelection()} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10 disabled:opacity-40">
            <Copy className="size-4" /><span className="flex-1">复制</span><kbd className="text-[10px] text-slate-400">Ctrl+Shift+C</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => void pasteClipboard()} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10">
            <ClipboardPaste className="size-4" /><span className="flex-1">粘贴</span><kbd className="text-[10px] text-slate-400">Ctrl+Shift+V</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => { terminalRef.current?.selectAll(); setContextMenu(null); terminalRef.current?.focus(); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10">
            <MousePointer2 className="size-4" /><span>全选终端内容</span>
          </button>
          <div className="my-1 border-t border-white/10" />
          <button type="button" role="menuitem" disabled={uploading} onClick={() => { setContextMenu(null); fileInputRef.current?.click(); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10 disabled:opacity-40">
            <UploadCloud className="size-4" /><span>上传文件到 ~/</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setContextMenu(null); if (keyboardLocked) exitKeyboardLock(); else void enterKeyboardLock(); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10"
          >
            {keyboardLocked ? <KeyboardOff className="size-4" /> : <Keyboard className="size-4" />}
            <span>{keyboardLocked ? "退出独占键盘" : "独占键盘（全屏）"}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => { setContextMenu(null); setAppearanceOpen(true); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10">
            <Palette className="size-4" /><span>终端背景…</span>
          </button>
          <button type="button" role="menuitem" onClick={() => { terminalRef.current?.clear(); setContextMenu(null); terminalRef.current?.focus(); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/10">
            <Eraser className="size-4" /><span>清屏</span>
          </button>
          <p className="mt-1 border-t border-white/10 px-3 pt-2 text-[11px] leading-5 text-slate-400">
            选中即复制，右键粘贴。tmux 开了鼠标模式时，按住 Shift 拖动可以直接选中。
          </p>
        </div>
      ) : null}
    </>
  );
}
