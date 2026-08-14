import assert from "node:assert/strict";
import test from "node:test";
import { escapeXml, urlsFor } from "./urls";

const SITE = "https://xiudou.site";

test("每个路径为两个 locale 各输出一条 url", () => {
  const xml = urlsFor(SITE, { path: "/posts" });
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
  assert.ok(xml.includes(`<loc>${SITE}/posts</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/en/posts</loc>`));
});

test("备用集合是对称的，且包含自身", () => {
  // Google 要求：一个 URL 声明的 hreflang 集合里必须包含它自己，
  // 否则整组会被忽略。
  const xml = urlsFor(SITE, { path: "/about" });
  assert.ok(xml.includes(`hreflang="zh-CN" href="${SITE}/about"`));
  assert.ok(xml.includes(`hreflang="en" href="${SITE}/en/about"`));
  assert.ok(xml.includes(`hreflang="x-default" href="${SITE}/about"`));
  // 两条 url 各自带完整的三条 alternate。
  assert.equal((xml.match(/rel="alternate"/g) ?? []).length, 6);
});

test("首页不带尾斜杠", () => {
  const xml = urlsFor(SITE, { path: "/" });
  assert.ok(xml.includes(`<loc>${SITE}/</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/en</loc>`));
  assert.ok(!xml.includes(`${SITE}/en/<`));
});

test("lastmod 存在时才输出", () => {
  const withDate = urlsFor(SITE, { path: "/posts/x", lastmod: "2026-08-13T00:00:00.000Z" });
  assert.ok(withDate.includes("<lastmod>2026-08-13T00:00:00.000Z</lastmod>"));
  assert.ok(!urlsFor(SITE, { path: "/tags/x" }).includes("<lastmod>"));
});

test("XML 特殊字符被转义", () => {
  // 标签 slug 里出现 & 会直接让 sitemap 变成非法 XML。
  assert.equal(escapeXml("a&b"), "a&amp;b");
  assert.equal(escapeXml('<"x">'), "&lt;&quot;x&quot;&gt;");
});
