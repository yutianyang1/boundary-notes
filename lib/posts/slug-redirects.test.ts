import assert from "node:assert/strict";
import test from "node:test";
import { resolveTagRedirect, TAG_SLUG_REDIRECTS } from "./slug-redirects";

test("旧的中文标签地址跳到英文 slug", () => {
  assert.equal(resolveTagRedirect("/tags/推理优化"), "/tags/inference-optimization");
  assert.equal(resolveTagRedirect("/tags/系统架构"), "/tags/system-architecture");
});

test("百分号编码形式同样命中", () => {
  // 中间件拿到的 pathname 可能是任一种形式。
  assert.equal(
    resolveTagRedirect(`/tags/${encodeURIComponent("推理优化")}`),
    "/tags/inference-optimization",
  );
});

test("locale 前缀被保留", () => {
  assert.equal(resolveTagRedirect("/en/tags/推理优化"), "/en/tags/inference-optimization");
});

test("已经是英文的 slug 不跳转", () => {
  // 跳转到自身会造成重定向循环。
  assert.equal(resolveTagRedirect("/tags/inference-optimization"), null);
  assert.equal(resolveTagRedirect("/tags/attention"), null);
});

test("非标签路径一律不处理", () => {
  assert.equal(resolveTagRedirect("/posts/推理优化"), null);
  assert.equal(resolveTagRedirect("/categories/推理优化"), null);
  assert.equal(resolveTagRedirect("/tags"), null);
});

test("多段路径不误判", () => {
  assert.equal(resolveTagRedirect("/tags/推理优化/extra"), null);
});

test("非法百分号编码不抛异常", () => {
  // decodeURIComponent 遇到孤立的 % 会抛错，中间件不能因此 500。
  assert.equal(resolveTagRedirect("/tags/%E4%B8"), null);
  assert.equal(resolveTagRedirect("/tags/%"), null);
});

test("映射目标全部是合法的 URL slug", () => {
  for (const [from, to] of Object.entries(TAG_SLUG_REDIRECTS)) {
    assert.match(to, /^[a-z0-9-]+$/, `${from} 的目标 ${to} 含非法字符`);
    assert.notEqual(from, to);
  }
});

test("映射目标互不重复", () => {
  // 两个标签指向同一个 slug 会让其中一个永远打不开。
  const targets = Object.values(TAG_SLUG_REDIRECTS);
  assert.equal(new Set(targets).size, targets.length);
});
