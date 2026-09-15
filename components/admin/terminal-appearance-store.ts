/**
 * 终端背景设置只存在当前浏览器：选项放 localStorage，图片放 IndexedDB
 * （localStorage 只有几 MB，而且只能存字符串）。隐私模式、禁用站点数据时读写会失败，
 * 一律当作没有设置，终端照常用默认背景。
 */
import { DEFAULT_APPEARANCE, normalizeAppearance, type TerminalAppearance } from "@/lib/terminal/appearance";

const SETTINGS_KEY = "blog:terminal-appearance";
const DB_NAME = "blog-terminal";
const STORE = "background";
const IMAGE_KEY = "image";

export function loadAppearance(): TerminalAppearance {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(appearance: TerminalAppearance) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(appearance));
  } catch {
    // 存不下就只在本次页面里生效。
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest) {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result as T);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadBackgroundImage() {
  try {
    const value = await withStore<unknown>("readonly", (store) => store.get(IMAGE_KEY));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

/** 返回是否真的存下了；失败时图片只在本次页面里显示。 */
export async function saveBackgroundImage(image: Blob) {
  try {
    await withStore("readwrite", (store) => store.put(image, IMAGE_KEY));
    return true;
  } catch {
    return false;
  }
}

export async function clearBackgroundImage() {
  try {
    await withStore("readwrite", (store) => store.delete(IMAGE_KEY));
  } catch {
    // 删不掉也无妨：界面上已经不显示。
  }
}
