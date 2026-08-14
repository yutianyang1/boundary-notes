import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown, rendererVersion } from "./render";
import { extractTableOfContents } from "./toc";

test("renderer v8 adds sanitized heading anchors that match the TOC", async () => {
  const html = await renderMarkdown("## 安装与配置\n\n### API & 安全\n");
  const toc = extractTableOfContents(html);

  assert.equal(rendererVersion, 8);
  assert.deepEqual(toc.map(({ label, level }) => ({ label, level })), [
    { label: "安装与配置", level: 2 },
    { label: "API & 安全", level: 3 },
  ]);
  for (const item of toc) {
    assert.match(item.id, /^user-content-/);
    assert.ok(html.includes(`id="${item.id}"`));
  }
});

test("renderer v8 bakes Mermaid code blocks into safe light and dark SVGs", async () => {
  const html = await renderMarkdown("```mermaid\nflowchart LR\nA[作者] --> B[内联 SVG]\n```");

  assert.match(html, /<figure class="mermaid-diagram"/);
  assert.match(html, /class="mermaid-light"/);
  assert.match(html, /class="mermaid-dark"/);
  assert.equal((html.match(/<svg\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /language-mermaid/);
  assert.doesNotMatch(html, /<script\b|<foreignObject\b|\son[a-z]+=/i);
});

test("mermaid SVG 带显式像素宽度，不被正文栏压扁", async () => {
  const html = await renderMarkdown("```mermaid\nflowchart LR\nA[作者] --> B[内联 SVG]\n```");

  // 带 viewBox 的 SVG 是替换元素：没有显式宽度时浏览器让它填满容器，
  // 于是宽图被压到正文栏宽（实测有效字号只剩约 5px）。
  // CSS 侧无解，width 的 auto / max-content / fit-content 都会填满容器。
  const widths = [...html.matchAll(/<svg[^>]*style="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(widths.length >= 2, "亮色与暗色各应有一个 svg");
  for (const style of widths) {
    assert.match(style, /width:\s*\d+px/, `svg 缺少显式宽度：${style}`);
  }
});

test("显式宽度取自 viewBox 而非写死", async () => {
  const html = await renderMarkdown("```mermaid\nflowchart LR\nA --> B\n```");
  const match = /<svg[^>]*viewBox="([^"]*)"[^>]*style="([^"]*)"/.exec(html)
    ?? /<svg[^>]*style="([^"]*)"[^>]*viewBox="([^"]*)"/.exec(html);
  assert.ok(match, "应同时带 viewBox 与 style");

  const [viewBox, style] = /viewBox/.test(match[0].slice(0, match[0].indexOf("style")))
    ? [match[1], match[2]]
    : [match[2], match[1]];
  const expected = Math.round(Number.parseFloat(viewBox.trim().split(/\s+/)[2]));
  assert.match(style, new RegExp(`width:${expected}px`));
});

test("renderer v8 preserves invalid Mermaid as an escaped plain-text code block", async () => {
  const html = await renderMarkdown(
    "```mermaid\nflowchart LR\nA[missing bracket --> B\n```",
  );

  assert.match(html, /class="[^"]*mermaid-fallback/);
  assert.match(html, /missing bracket/);
  assert.doesNotMatch(html, /<figure class="mermaid-diagram"/);
  assert.doesNotMatch(html, /class="language-mermaid"/);
});

test("renderer v8 neutralizes active content embedded in Mermaid source", async () => {
  const html = await renderMarkdown(
    [
      "```mermaid",
      "flowchart LR",
      'A["<script>alert(1)</script>"] --> B["<img src=x onerror=alert(2)>"]',
      'click A "javascript:alert(3)"',
      "```",
    ].join("\n"),
  );

  assert.doesNotMatch(html, /<script\b|<foreignObject\b|<iframe\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(
    html,
    /(?:href|src)\s*=\s*["']\s*javascript:/i,
  );
});

test("renderer v8 renders inline and display math as complete KaTeX markup", async () => {
  const html = await renderMarkdown(
    [
      "行内均值 $\\mu$ 保持在文本中。",
      "",
      "$$",
      "y = \\gamma\\frac{x-\\mu}{\\sqrt{\\sigma^2+\\varepsilon}}+\\beta",
      "$$",
    ].join("\n"),
  );

  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<math\b/);
  assert.match(html, /<mfrac>/);
  assert.match(html, /<msqrt>/);
  assert.doesNotMatch(html, /class="math math-(?:inline|display)"/);
});

test("renderer v8 preserves a malformed formula without aborting the article", async () => {
  const html = await renderMarkdown("正文仍然存在。\n\n$$\\frac{1}{$$");

  assert.match(html, /正文仍然存在/);
  assert.match(html, /class="katex-error"/);
});

test("renderer v8 keeps sanitizing author HTML around math output", async () => {
  const html = await renderMarkdown(
    '<script>alert(1)</script><img src="x" onerror="alert(2)">\n\n$\\href{javascript:alert(3)}{x}$',
  );

  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /href\s*=\s*["']\s*javascript:/i);
});
