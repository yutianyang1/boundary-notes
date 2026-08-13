import assert from "node:assert/strict";
import test from "node:test";
import { assertGitHubUserEligible, GitHubOAuthError, newGitHubReader, selectVerifiedPrimaryGitHubEmail } from "./github";

test("GitHub login accepts only a verified primary email", () => {
  assert.equal(selectVerifiedPrimaryGitHubEmail([
    { email: "secondary@example.com", primary: false, verified: true },
    { email: "victim@example.com", primary: true, verified: false },
  ]), null);
  assert.equal(selectVerifiedPrimaryGitHubEmail([
    { email: " Reader@Example.com ", primary: true, verified: true },
  ]), "reader@example.com");
});

test("GitHub login rejects staff, disabled, and deleted users", () => {
  const eligible = { role: "reader" as const, disabledAt: null, deletedAt: null };
  assert.doesNotThrow(() => assertGitHubUserEligible(eligible));
  for (const user of [
    { ...eligible, role: "admin" as const },
    { ...eligible, disabledAt: new Date() },
    { ...eligible, deletedAt: new Date() },
  ]) {
    assert.throws(() => assertGitHubUserEligible(user), GitHubOAuthError);
  }
});

test("a new GitHub user is always provisioned as a verified reader", () => {
  const now = new Date("2026-08-04T00:00:00.000Z");
  const values = newGitHubReader({ email: "reader@example.com", name: "Reader", image: null }, now);
  assert.equal(values.role, "reader");
  assert.equal(values.emailVerified, now);
});
