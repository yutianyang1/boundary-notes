const DAY_MS = 24 * 60 * 60 * 1_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;

export type DailyViewRow = {
  day: string;
  viewCount: number;
};

export function shanghaiDayKey(date = new Date()) {
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function buildDailyViewSeries(
  rows: DailyViewRow[],
  days = 14,
  now = new Date(),
) {
  const safeDays = Math.max(1, Math.trunc(days));
  const counts = new Map(rows.map((row) => [row.day, row.viewCount]));
  const today = Date.parse(`${shanghaiDayKey(now)}T00:00:00.000Z`);

  return Array.from({ length: safeDays }, (_, index) => {
    const offset = safeDays - index - 1;
    const day = new Date(today - offset * DAY_MS).toISOString().slice(0, 10);
    return { day, viewCount: counts.get(day) ?? 0 };
  });
}
