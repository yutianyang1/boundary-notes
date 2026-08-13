export const VIEW_DEDUPLICATION_WINDOW_MS = 6 * 60 * 60 * 1_000;

export function viewStorageKey(slug: string) {
  return `blog:view:${slug}`;
}

export function shouldRecordView(
  lastRecordedAt: string | null,
  now = Date.now(),
  windowMs = VIEW_DEDUPLICATION_WINDOW_MS,
) {
  if (!lastRecordedAt) return true;
  const timestamp = Number.parseInt(lastRecordedAt, 10);
  return !Number.isFinite(timestamp) || now - timestamp >= windowMs;
}
