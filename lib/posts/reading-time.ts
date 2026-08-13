/**
 * 中文阅读速度按 400 字/分钟估算（常见区间 300–500，取中值）。
 * 这是估算值，不是实测数据，仅用于给读者一个量级参考。
 */
const CHARS_PER_MINUTE = 400;

export function readingMinutes(charCount: number): number {
  return Math.max(1, Math.round(charCount / CHARS_PER_MINUTE));
}

/** "8 分钟 · 3.2 千字"，字数不足一千时显示具体数字。 */
export function readingMeta(charCount: number): string {
  const minutes = readingMinutes(charCount);
  const words =
    charCount >= 1000
      ? `${(charCount / 1000).toFixed(1)} 千字`
      : `${charCount} 字`;
  return `${minutes} 分钟 · ${words}`;
}
