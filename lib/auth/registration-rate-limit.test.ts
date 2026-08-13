import assert from "node:assert/strict";
import test from "node:test";
import { areRegistrationCountsAllowed } from "./registration-rate-limit";

test("registration limits both IP and email dimensions", () => {
  assert.equal(areRegistrationCountsAllowed(5, 2), true);
  assert.equal(areRegistrationCountsAllowed(6, 1), false);
  assert.equal(areRegistrationCountsAllowed(1, 3), false);
});
