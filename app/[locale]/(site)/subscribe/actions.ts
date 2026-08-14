"use server";

import { headers } from "next/headers";
import { extractClientIp } from "@/lib/auth/device";
import { isSubscriptionEnabled } from "@/lib/features";
import { allowSubscriptionRequest } from "@/lib/subscribe/rate-limit";
import { normalizeSubscriberEmail, requestSubscription } from "@/lib/subscribe/service";

/**
 * 只返回一个标记，不返回文案：无论邮箱是否已订阅都是同一个响应，
 * 以免暴露某个地址是否在订阅列表里。翻译交给 UI。
 */
export type SubscribeActionState = { submitted?: boolean };

export async function subscribeAction(
  _state: SubscribeActionState,
  formData: FormData,
): Promise<SubscribeActionState> {
  const response = { submitted: true };
  if (!isSubscriptionEnabled()) return response;

  const email = normalizeSubscriberEmail(String(formData.get("email") ?? ""));
  const ip = extractClientIp(await headers());
  if (!await allowSubscriptionRequest(ip, email)) return response;

  try {
    await requestSubscription(email);
  } catch (error) {
    console.error("subscription request failed", error instanceof Error ? error.message : "unknown error");
  }
  return response;
}
