import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteComment, resolveCommentDepth } from "./policy";

test("comment replies cannot cross posts or exceed one reply level", () => {
  assert.equal(resolveCommentDepth(null, "post-a"), 0);
  assert.equal(resolveCommentDepth({ postId: "post-a", depth: 0 }, "post-a"), 1);
  assert.throws(() => resolveCommentDepth({ postId: "post-b", depth: 0 }, "post-a"), /MISMATCH/);
  assert.throws(() => resolveCommentDepth({ postId: "post-a", depth: 1 }, "post-a"), /DEPTH/);
});

test("only the owner or staff can delete a comment", () => {
  assert.equal(canDeleteComment({ id: "reader-a", role: "reader" }, "reader-a"), true);
  assert.equal(canDeleteComment({ id: "reader-b", role: "reader" }, "reader-a"), false);
  assert.equal(canDeleteComment({ id: "author", role: "author" }, "reader-a"), true);
});
