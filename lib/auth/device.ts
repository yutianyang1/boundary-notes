import { isIP } from "node:net";

function firstMatch(value: string, candidates: Array<[RegExp, string]>) {
  return candidates.find(([pattern]) => pattern.test(value))?.[1];
}

/**
 * 从 User-Agent 归纳出设备描述，用于账户中心的登录设备列表。
 *
 * 返回值会写进数据库，所以只能是与语言无关的内容——浏览器名和系统名都是
 * 品牌名，两种语言下都读得通。认不出来的部分直接省略，认不出任何东西时
 * 返回 null，由界面按当前语言显示「未知设备」/「Unknown device」。
 *
 * 早先的版本在这里返回「未知设备」「浏览器」「未知系统」，于是英文站的
 * 设备列表会冒出中文，而且是存量数据，改文案也修不掉。
 */
export function describeDevice(userAgent: string | null | undefined) {
  if (!userAgent) return null;

  const browser = firstMatch(userAgent, [
    [/\bEdg\//, "Edge"],
    [/\bOPR\//, "Opera"],
    [/\bChrome\//, "Chrome"],
    [/\bFirefox\//, "Firefox"],
    [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  ]);

  const os = firstMatch(userAgent, [
    [/\bWindows NT\b/, "Windows"],
    [/\bAndroid\b/, "Android"],
    [/\b(iPhone|iPad|iPod)\b/, "iOS"],
    [/\bMac OS X\b/, "macOS"],
    [/\b(CrOS|Chromebook)\b/, "ChromeOS"],
    [/\bLinux\b/, "Linux"],
  ]);

  // 只认出一半时给出认出的那半，比「浏览器 · 未知系统」更有信息量。
  return [browser, os].filter(Boolean).join(" · ") || null;
}

export function extractClientIp(headers: Headers) {
  const raw = headers.get("x-real-ip")
    ?? headers.get("cf-connecting-ip")
    ?? headers.get("x-forwarded-for")?.split(",", 1)[0]
    ?? null;
  const candidate = raw?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}
