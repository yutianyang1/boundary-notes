import { describeDevice } from "@/lib/auth/device";

export function formatShanghaiDate(value: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function securityAlertPayload(headers: Headers, actionLabel: string, occurredAt: Date) {
  const accountUrl = new URL("/account", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost").toString();
  return {
    actionLabel,
    occurredAt: formatShanghaiDate(occurredAt),
    deviceName: describeDevice(headers.get("user-agent")),
    accountUrl,
  };
}
