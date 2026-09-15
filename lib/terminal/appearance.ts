/** Web 终端背景设置：纯函数部分（校验、默认值、按背景深浅配文字颜色）。 */

export type BackgroundFit = "cover" | "contain" | "tile";

export type TerminalAppearance = {
  /** 纯色背景；有图片时作为图片没铺到的底色。 */
  color: string;
  /** 图片上的黑色遮罩浓度，百分比。 */
  dim: number;
  /** 图片模糊半径，px。 */
  blur: number;
  fit: BackgroundFit;
};

export const DEFAULT_APPEARANCE: TerminalAppearance = { color: "#070b14", dim: 55, blur: 0, fit: "cover" };

export const BACKGROUND_PRESETS = [
  { name: "深夜蓝", color: "#070b14" },
  { name: "纯黑", color: "#000000" },
  { name: "石墨", color: "#1c1f24" },
  { name: "墨绿", color: "#0b1f17" },
  { name: "暗紫", color: "#17112a" },
  { name: "纸白", color: "#f7f5ef" },
] as const;

export const MAX_DIM = 90;
export const MAX_BLUR = 20;
export const MAX_BACKGROUND_IMAGE_BYTES = 20 * 1024 * 1024;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

/** localStorage 里读出来的东西不可信：逐项校验，坏的项回落到默认值。 */
export function normalizeAppearance(value: unknown): TerminalAppearance {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    color: typeof input.color === "string" && HEX_COLOR.test(input.color) ? input.color.toLowerCase() : DEFAULT_APPEARANCE.color,
    dim: clampNumber(input.dim, 0, MAX_DIM, DEFAULT_APPEARANCE.dim),
    blur: clampNumber(input.blur, 0, MAX_BLUR, DEFAULT_APPEARANCE.blur),
    fit: input.fit === "contain" || input.fit === "tile" ? input.fit : "cover",
  };
}

/** WCAG 相对亮度。 */
export function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function isLightBackground(appearance: TerminalAppearance, hasImage: boolean) {
  // 有图片时文字压在黑色遮罩上，按深色处理。
  return !hasImage && relativeLuminance(appearance.color) > 0.35;
}

/**
 * xterm 主题。背景始终透明，颜色和图片由终端外面的容器画；
 * 文字、光标、选区颜色随背景深浅切换，保证看得清。
 */
export function terminalTheme(appearance: TerminalAppearance, hasImage: boolean) {
  if (isLightBackground(appearance, hasImage)) {
    return { background: "#00000000", foreground: "#1f2937", cursor: "#4338ca", cursorAccent: "#f8fafc", selectionBackground: "#4338ca33" };
  }
  return { background: "#00000000", foreground: "#e5e7eb", cursor: "#a5b4fc", cursorAccent: "#070b14", selectionBackground: "#94a3b859" };
}
