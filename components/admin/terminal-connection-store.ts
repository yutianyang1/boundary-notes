/**
 * 常用连接存在 localStorage，通过 useSyncExternalStore 读：服务端渲染和首次水合都拿空列表，
 * 挂载后再换成本地数据，不会水合不一致；别的标签页改了也会同步过来。
 * 隐私模式、禁用站点数据时读写失败，就当作没有常用连接。
 */
import { useSyncExternalStore } from "react";
import {
  forgetConnection,
  normalizeSavedConnections,
  rememberConnection,
  type SavedConnection,
} from "@/lib/terminal/saved-connections";

const STORAGE_KEY = "blog:terminal-connections";
const EMPTY: SavedConnection[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedList: SavedConnection[] = EMPTY;

function readRaw() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot() {
  const raw = readRaw();
  // 快照必须在内容没变时保持同一个引用，否则 useSyncExternalStore 会无限重渲染。
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedList = raw ? normalizeSavedConnections(JSON.parse(raw)) : EMPTY;
    } catch {
      cachedList = EMPTY;
    }
  }
  return cachedList;
}

function getServerSnapshot() {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(list: SavedConnection[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 存不下就不记，不影响连接本身。
  }
  for (const listener of listeners) listener();
}

export function useSavedConnections() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function saveConnection(connection: SavedConnection) {
  write(rememberConnection(getSnapshot(), connection));
}

export function deleteConnection(key: string) {
  write(forgetConnection(getSnapshot(), key));
}
