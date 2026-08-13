import { readFile } from "node:fs/promises";
import path from "node:path";

let fontPromise: Promise<ArrayBuffer> | undefined;

function loadFontData() {
  fontPromise ??= readFile(path.join(
    process.cwd(),
    "assets",
    "fonts",
    "NotoSansSC-Bold.ttf",
  )).then((bytes) => (
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  ));
  return fontPromise;
}

export async function loadOgFonts() {
  return {
    fonts: [{
      name: "Noto Sans SC",
      data: await loadFontData(),
      weight: 700 as const,
      style: "normal" as const,
    }],
    family: '"Noto Sans SC"',
  };
}
