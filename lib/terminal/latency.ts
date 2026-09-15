/** 终端延迟测量用的纯函数：服务端拼 Server-Timing 头，浏览器端解析并统计分位数。 */

export type TimingEntry = { name: string; duration: number };

export function formatServerTiming(entries: TimingEntry[]) {
  return entries
    .map(({ name, duration }) => `${name};dur=${Math.max(0, duration).toFixed(1)}`)
    .join(", ");
}

export function parseServerTiming(header: string | null) {
  const result: Record<string, number> = {};
  if (!header) return result;
  for (const part of header.split(",")) {
    const [rawName, ...params] = part.split(";").map((item) => item.trim());
    if (!rawName) continue;
    const dur = params.find((param) => param.startsWith("dur="));
    const value = dur ? Number(dur.slice(4)) : Number.NaN;
    if (Number.isFinite(value)) result[rawName] = value;
  }
  return result;
}

/** 最近邻分位数；samples 不要求有序。空数组返回 NaN。 */
export function percentile(samples: number[], p: number) {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}
