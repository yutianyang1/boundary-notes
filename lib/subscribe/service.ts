import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { createActionToken, digestActionToken } from "@/lib/auth/action-tokens";
import { db } from "@/lib/db";
import { mailOutbox, postBroadcasts, posts, subscribers } from "@/lib/db/schema";
import { isSubscriptionEnabled } from "@/lib/features";
import { encryptOutboxPayload } from "@/lib/mail/outbox";
import { unsubscribeToken, verifyUnsubscribeToken } from "@/lib/subscribe/tokens";

const emailSchema = z.string().email().max(320);
const uuidSchema = z.string().uuid();
const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1_000;
const OUTBOX_BATCH_SIZE = 500;

export type SubscriberState = "missing" | "pending" | "confirmed" | "unsubscribed";

export function normalizeSubscriberEmail(value: string) {
  return value.trim().toLowerCase();
}

export function shouldIssueConfirmation(state: SubscriberState) {
  return state !== "confirmed";
}

function publicSiteUrl() {
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("NEXT_PUBLIC_SITE_URL must be HTTP(S)");
  return url;
}

export async function requestSubscription(rawEmail: string) {
  const email = normalizeSubscriberEmail(rawEmail);
  if (!emailSchema.safeParse(email).success || !isSubscriptionEnabled()) return false;

  const { token, tokenDigest } = createActionToken();
  const confirmUrl = new URL("/subscribe/confirm", publicSiteUrl());
  confirmUrl.searchParams.set("token", token);
  const payloadEnc = encryptOutboxPayload({ confirmUrl: confirmUrl.toString() });
  const expiresAt = new Date(Date.now() + CONFIRM_TOKEN_TTL_MS);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: subscribers.id, status: subscribers.status })
      .from(subscribers)
      .where(eq(subscribers.email, email))
      .limit(1)
      .for("update");

    if (existing?.status === "confirmed") return false;

    if (existing) {
      await tx.update(subscribers).set({
        status: "pending",
        confirmTokenDigest: tokenDigest,
        confirmTokenExpiresAt: expiresAt,
        confirmedAt: null,
        unsubscribedAt: null,
        updatedAt: new Date(),
      }).where(eq(subscribers.id, existing.id));
    } else {
      await tx.insert(subscribers).values({
        email,
        status: "pending",
        confirmTokenDigest: tokenDigest,
        confirmTokenExpiresAt: expiresAt,
      });
    }

    await tx.insert(mailOutbox).values({
      template: "subscribe_confirm",
      recipient: email,
      payloadEnc,
      encryptionKeyVersion: 1,
    });
    return true;
  });
}

export async function confirmSubscription(token: string) {
  if (!isSubscriptionEnabled() || token.length < 20 || token.length > 512) return false;
  const digest = digestActionToken(token);
  const [confirmed] = await db.update(subscribers).set({
    status: "confirmed",
    confirmedAt: new Date(),
    unsubscribedAt: null,
    confirmTokenDigest: null,
    confirmTokenExpiresAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(subscribers.confirmTokenDigest, digest),
    eq(subscribers.status, "pending"),
    gt(subscribers.confirmTokenExpiresAt, new Date()),
  )).returning({ id: subscribers.id });
  return Boolean(confirmed);
}

export async function unsubscribe(id: string, token: string) {
  if (!isSubscriptionEnabled() || !uuidSchema.safeParse(id).success || token.length > 512) return false;
  if (!verifyUnsubscribeToken(id, token)) return false;
  const [subscriber] = await db.update(subscribers).set({
    status: "unsubscribed",
    unsubscribedAt: new Date(),
    confirmTokenDigest: null,
    confirmTokenExpiresAt: null,
    updatedAt: new Date(),
  }).where(eq(subscribers.id, id)).returning({ id: subscribers.id });
  return Boolean(subscriber);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function enqueuePostBroadcast(tx: Transaction, postId: string) {
  if (!isSubscriptionEnabled()) return 0;

  const [claimed] = await tx.insert(postBroadcasts).values({ postId })
    .onConflictDoNothing()
    .returning({ postId: postBroadcasts.postId });
  if (!claimed) return 0;

  const [post] = await tx.select({
    title: posts.title,
    summary: posts.summary,
    slug: posts.slug,
  }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error("Cannot broadcast a missing post");

  const recipients = await tx.select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(eq(subscribers.status, "confirmed"));
  const postUrl = new URL(`/posts/${encodeURIComponent(post.slug)}`, publicSiteUrl()).toString();

  for (let offset = 0; offset < recipients.length; offset += OUTBOX_BATCH_SIZE) {
    const batch = recipients.slice(offset, offset + OUTBOX_BATCH_SIZE).map((subscriber) => {
      const unsubscribeUrl = new URL("/unsubscribe", publicSiteUrl());
      unsubscribeUrl.searchParams.set("id", subscriber.id);
      unsubscribeUrl.searchParams.set("token", unsubscribeToken(subscriber.id));
      const oneClickUnsubscribeUrl = new URL("/api/subscriptions/unsubscribe", publicSiteUrl());
      oneClickUnsubscribeUrl.search = unsubscribeUrl.search;
      return {
        template: "post_published",
        recipient: subscriber.email,
        payloadEnc: encryptOutboxPayload({
          postTitle: post.title,
          postSummary: post.summary,
          postUrl,
          unsubscribeUrl: unsubscribeUrl.toString(),
          oneClickUnsubscribeUrl: oneClickUnsubscribeUrl.toString(),
        }),
        encryptionKeyVersion: 1,
      };
    });
    if (batch.length) await tx.insert(mailOutbox).values(batch);
  }

  await tx.update(postBroadcasts)
    .set({ recipientCount: recipients.length })
    .where(eq(postBroadcasts.postId, postId));
  return recipients.length;
}
