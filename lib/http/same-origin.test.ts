import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginRequest } from "./same-origin";

test("accepts absent or matching Origin and rejects cross-site requests", () => {
  assert.equal(isSameOriginRequest(new Request("https://blog.test/api")), true);
  assert.equal(isSameOriginRequest(new Request("https://blog.test/api", {
    headers: { host: "blog.test", origin: "https://blog.test" },
  })), true);
  assert.equal(isSameOriginRequest(new Request("https://blog.test/api", {
    headers: { host: "blog.test", origin: "https://evil.test" },
  })), false);
  assert.equal(isSameOriginRequest(new Request("https://blog.test/api", {
    headers: { host: "blog.test", origin: "not a url" },
  })), false);
});
