"use server";

import { headers } from "next/headers";
import { extractClientIp } from "@/lib/auth/device";
import { isSubscriptionEnabled } from "@/lib/features";
import { allowSubscriptionRequest } from "@/lib/subscribe/rate-limit";
import { normalizeSubscriberEmail, requestSubscription } from "@/lib/subscribe/service";

export type SubscribeActionState = { message?: string };
const subscribeResponseMessage = "如果该邮箱可用，确认邮件将会发送";

export async function subscribeAction(
  _state: SubscribeActionState,
  formData: FormData,
): Promise<SubscribeActionState> {
  const response = { message: subscribeResponseMessage };
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
