import assert from "node:assert/strict";
import test from "node:test";
import { canManagePost, isEditorRole, isStaffRole } from "./roles";

test("reader never receives staff or editor capabilities", () => {
  assert.equal(isStaffRole("reader"), false);
  assert.equal(isEditorRole("reader"), false);
  assert.equal(canManagePost({ id: "reader-1", role: "reader" }, "reader-1"), false);
});

test("author can manage only their own posts", () => {
  assert.equal(canManagePost({ id: "author-1", role: "author" }, "author-1"), true);
  assert.equal(canManagePost({ id: "author-1", role: "author" }, "author-2"), false);
});

test("editor and admin can manage other authors' posts", () => {
  assert.equal(isEditorRole("editor"), true);
  assert.equal(isEditorRole("admin"), true);
  assert.equal(canManagePost({ id: "editor-1", role: "editor" }, "author-1"), true);
  assert.equal(canManagePost({ id: "admin-1", role: "admin" }, "author-1"), true);
});
