/**
 * 终端输入分片。服务端单次输入上限 16 KiB，粘贴一大段文本时必须切开再发，
 * 否则整段被拒（413），粘贴看起来就像没反应。
 */

/** 按 UTF-8 最坏情况 4 字节/字符估算，4000 字符最多 16000 字节，留一点余量。 */
export const MAX_INPUT_CHARS = 4_000;

export function splitTerminalInput(value: string, maxChars = MAX_INPUT_CHARS) {
  if (value.length <= maxChars) return value ? [value] : [];
  const chunks: string[] = [];
  for (let index = 0; index < value.length;) {
    let end = Math.min(value.length, index + maxChars);
    // 不要把代理对（emoji 等）从中间切开，否则两边都成了坏字符。
    if (end < value.length) {
      const code = value.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    }
    chunks.push(value.slice(index, end));
    index = end;
  }
  return chunks;
}
