import assert from "node:assert/strict";
import test from "node:test";
import { arePasswordResetCountsAllowed } from "./password-reset-rate-limit";

test("password reset rate limits allow five requests per IP and two per email", () => {
  assert.equal(arePasswordResetCountsAllowed(5, 2), true);
  assert.equal(arePasswordResetCountsAllowed(6, 1), false);
  assert.equal(arePasswordResetCountsAllowed(1, 3), false);
});
