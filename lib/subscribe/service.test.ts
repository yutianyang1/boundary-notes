import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { postBroadcasts } from "@/lib/db/schema";
import { enqueuePostBroadcast, normalizeSubscriberEmail, shouldIssueConfirmation } from "./service";

test("subscriber email normalization and state machine", () => {
  assert.equal(normalizeSubscriberEmail(" Foo@Bar.COM "), "foo@bar.com");
  assert.equal(shouldIssueConfirmation("missing"), true);
  assert.equal(shouldIssueConfirmation("pending"), true);
  assert.equal(shouldIssueConfirmation("unsubscribed"), true);
  assert.equal(shouldIssueConfirmation("confirmed"), false);
});

test("post broadcast claim is idempotent", async () => {
  const previous = {
    enabled: process.env.SUBSCRIPTIONS_ENABLED,
    subscribeKey: process.env.SUBSCRIBE_TOKEN_SECRET,
    mailKey: process.env.MAIL_OUTBOX_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  };
  process.env.SUBSCRIPTIONS_ENABLED = "true";
  process.env.SUBSCRIBE_TOKEN_SECRET = randomBytes(32).toString("base64");
  process.env.MAIL_OUTBOX_KEY = randomBytes(32).toString("base64");
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  let claimed = false;
  let queued = 0;

  const fakeTx = {
    insert(table: unknown) {
      return {
        values(values: unknown) {
          if (table === postBroadcasts) {
            return {
              onConflictDoNothing() { return this; },
              returning() {
                if (claimed) return Promise.resolve([]);
                claimed = true;
                return Promise.resolve([{ postId: "5539eaf4-3dab-4c51-8e10-1b9e41a88980" }]);
              },
            };
          }
          queued += Array.isArray(values) ? values.length : 1;
          return Promise.resolve();
        },
      };
    },
    select(fields: Record<string, unknown>) {
      return {
        from() {
          return {
            where() {
              if ("title" in fields) {
                return { limit: () => Promise.resolve([{ title: "文章", summary: "摘要", slug: "post" }]) };
              }
              return Promise.resolve([{ id: "3b260457-3b48-4c26-8674-7cb34d174256", email: "reader@example.test" }]);
            },
          };
        },
      };
    },
    update() {
      return { set: () => ({ where: () => Promise.resolve() }) };
    },
  };

  try {
    assert.equal(await enqueuePostBroadcast(fakeTx as never, "5539eaf4-3dab-4c51-8e10-1b9e41a88980"), 1);
    assert.equal(await enqueuePostBroadcast(fakeTx as never, "5539eaf4-3dab-4c51-8e10-1b9e41a88980"), 0);
    assert.equal(queued, 1);
  } finally {
    restore("SUBSCRIPTIONS_ENABLED", previous.enabled);
    restore("SUBSCRIBE_TOKEN_SECRET", previous.subscribeKey);
    restore("MAIL_OUTBOX_KEY", previous.mailKey);
    restore("NEXT_PUBLIC_SITE_URL", previous.siteUrl);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
