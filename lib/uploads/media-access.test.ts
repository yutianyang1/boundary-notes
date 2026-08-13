import assert from "node:assert/strict";
import test from "node:test";
import { canAccessMediaLibrary, canManageMediaAsset } from "./media-access";

test("readers cannot access media while staff can", () => {
  assert.equal(canAccessMediaLibrary("reader"), false);
  assert.equal(canAccessMediaLibrary("author"), true);
  assert.equal(canAccessMediaLibrary("editor"), true);
  assert.equal(canAccessMediaLibrary("admin"), true);
});

test("staff manage their own assets and admins manage every asset", () => {
  assert.equal(canManageMediaAsset({ id: "one", role: "editor" }, "one"), true);
  assert.equal(canManageMediaAsset({ id: "one", role: "editor" }, "two"), false);
  assert.equal(canManageMediaAsset({ id: "one", role: "admin" }, "two"), true);
});
