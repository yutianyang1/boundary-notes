import { isIP } from "node:net";

function firstMatch(value: string, candidates: Array<[RegExp, string]>) {
  return candidates.find(([pattern]) => pattern.test(value))?.[1];
}

export function describeDevice(userAgent: string | null | undefined) {
  if (!userAgent) return "未知设备";

  const browser = firstMatch(userAgent, [
    [/\bEdg\//, "Edge"],
    [/\bOPR\//, "Opera"],
    [/\bChrome\//, "Chrome"],
    [/\bFirefox\//, "Firefox"],
    [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  ]) ?? "浏览器";

  const os = firstMatch(userAgent, [
    [/\bWindows NT\b/, "Windows"],
    [/\bAndroid\b/, "Android"],
    [/\b(iPhone|iPad|iPod)\b/, "iOS"],
    [/\bMac OS X\b/, "macOS"],
    [/\b(CrOS|Chromebook)\b/, "ChromeOS"],
    [/\bLinux\b/, "Linux"],
  ]) ?? "未知系统";

  return `${browser} · ${os}`;
}

export function extractClientIp(headers: Headers) {
  const raw = headers.get("x-real-ip")
    ?? headers.get("cf-connecting-ip")
    ?? headers.get("x-forwarded-for")?.split(",", 1)[0]
    ?? null;
  const candidate = raw?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}
