import assert from "node:assert/strict";
import test from "node:test";
import { safeLocalRedirect } from "./redirect";

test("login redirects accept local paths and reject external or protocol-relative URLs", () => {
  assert.equal(safeLocalRedirect("/posts/demo#comments"), "/posts/demo#comments");
  assert.equal(safeLocalRedirect("//evil.example/path"), "/account");
  assert.equal(safeLocalRedirect("https://evil.example/path"), "/account");
});
