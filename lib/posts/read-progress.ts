/**
 * 阅读进度只存在读者自己的浏览器里,不落库。
 *
 * 两个原因:站上绝大多数读者没有账号,做成账号功能等于对多数人不存在;
 * 而「读过哪些文章」是阅读行为记录,不收集就不必保护。代价是换设备、
 * 清缓存之后进度归零——它是个便利标记,不是账号资产,别按资产去承诺。
 */
export const READ_POSTS_STORAGE_KEY = "blog:read-posts:v1";

/** 同一页面里改动后通知其它组件重算;跨标签页由 storage 事件负责。 */
export const READ_POSTS_CHANGED_EVENT = "blog:read-posts-changed";

/** 封顶是为了避免长期使用后无声撑爆 localStorage 配额。 */
export const READ_POSTS_LIMIT = 500;

/** slug → 首次读完的时间戳。留首次而非最近,重读不会顶掉更早的记录。 */
export type ReadPosts = Record<string, number>;

export function parseReadPosts(raw: string | null): ReadPosts {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([slug, at]) => slug !== "" && typeof at === "number" && Number.isFinite(at));
  // fromEntries 建的是自有属性,存进来的 "__proto__" 不会改到原型上。
  return Object.fromEntries(entries) as ReadPosts;
}

export function serializeReadPosts(state: ReadPosts) {
  return JSON.stringify(state);
}

export function isPostRead(state: ReadPosts, slug: string) {
  return Object.prototype.hasOwnProperty.call(state, slug);
}

export function countRead(state: ReadPosts, slugs: readonly string[]) {
  return slugs.reduce((total, slug) => (isPostRead(state, slug) ? total + 1 : total), 0);
}

/** 返回 null 表示无变化,调用方据此跳过写入。 */
export function markPostRead(state: ReadPosts, slug: string, now = Date.now()): ReadPosts | null {
  if (!slug || isPostRead(state, slug)) return null;
  return capped({ ...state, [slug]: now });
}

/** 返回 null 表示无变化。用于「重置本系列进度」,只清掉传入的这些。 */
export function forgetPosts(state: ReadPosts, slugs: readonly string[]): ReadPosts | null {
  const doomed = slugs.filter((slug) => isPostRead(state, slug));
  if (!doomed.length) return null;
  const next = { ...state };
  for (const slug of doomed) delete next[slug];
  return next;
}

function capped(state: ReadPosts): ReadPosts {
  const entries = Object.entries(state);
  if (entries.length <= READ_POSTS_LIMIT) return state;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, READ_POSTS_LIMIT));
}

export function loadRawReadPosts(): string | null {
  try {
    return window.localStorage.getItem(READ_POSTS_STORAGE_KEY);
  } catch {
    // 隐私模式下 localStorage 可能直接抛错,当作没有记录。
    return null;
  }
}

export function saveReadPosts(state: ReadPosts) {
  try {
    window.localStorage.setItem(READ_POSTS_STORAGE_KEY, serializeReadPosts(state));
  } catch {
    // 写不进去就不广播:界面继续显示存储里真实的那份,不做假。
    return;
  }
  window.dispatchEvent(new Event(READ_POSTS_CHANGED_EVENT));
}
