import assert from "node:assert/strict";
import test from "node:test";
import { areLoginCountsAllowed } from "./login-rate-limit";

test("login limiter applies both account and IP ceilings", () => {
  assert.equal(areLoginCountsAllowed(20, 10), true);
  assert.equal(areLoginCountsAllowed(21, 1), false);
  assert.equal(areLoginCountsAllowed(1, 11), false);
});
