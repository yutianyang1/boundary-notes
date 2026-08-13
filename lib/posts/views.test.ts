import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldRecordView,
  VIEW_DEDUPLICATION_WINDOW_MS,
  viewStorageKey,
} from "./views";

test("view counter deduplicates a browser for six hours", () => {
  const now = Date.UTC(2026, 6, 28, 8);
  assert.equal(shouldRecordView(null, now), true);
  assert.equal(shouldRecordView("invalid", now), true);
  assert.equal(shouldRecordView(String(now - VIEW_DEDUPLICATION_WINDOW_MS + 1), now), false);
  assert.equal(shouldRecordView(String(now - VIEW_DEDUPLICATION_WINDOW_MS), now), true);
});

test("view storage keys are isolated by article slug", () => {
  assert.equal(viewStorageKey("one"), "blog:view:one");
  assert.notEqual(viewStorageKey("one"), viewStorageKey("two"));
});
