import assert from "node:assert/strict";
import test from "node:test";
import { localePath } from "../../i18n/href";

test("default locale keeps paths unprefixed", () => {
  // 站点已上线且 sitemap 已提交，中文地址一个字都不能变。
  assert.equal(localePath("/", "zh"), "/");
  assert.equal(localePath("/posts", "zh"), "/posts");
  assert.equal(localePath("/posts/flash-attention", "zh"), "/posts/flash-attention");
});

test("secondary locale gets a prefix", () => {
  assert.equal(localePath("/posts", "en"), "/en/posts");
  assert.equal(localePath("/categories/inference-optimization", "en"), "/en/categories/inference-optimization");
});

test("home page does not collect a trailing slash", () => {
  // "/en/" 与实际路由 "/en" 不同，出现在 canonical 或 sitemap 里会被当成两个地址。
  assert.equal(localePath("/", "en"), "/en");
});

test("query strings and fragments survive prefixing", () => {
  assert.equal(localePath("/posts?year=2026&page=2", "en"), "/en/posts?year=2026&page=2");
  assert.equal(localePath("/posts/x#comments", "en"), "/en/posts/x#comments");
});
