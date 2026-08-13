import assert from "node:assert/strict";
import test from "node:test";
import { areCommentCountsAllowed } from "./rate-limit";

test("comment rate limits enforce both minute and hour thresholds", () => {
  assert.equal(areCommentCountsAllowed(3, 20), true);
  assert.equal(areCommentCountsAllowed(4, 1), false);
  assert.equal(areCommentCountsAllowed(1, 21), false);
});
