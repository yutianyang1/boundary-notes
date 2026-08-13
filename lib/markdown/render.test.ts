import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown, rendererVersion } from "./render";
import { extractTableOfContents } from "./toc";

test("renderer v7 adds sanitized heading anchors that match the TOC", async () => {
  const html = await renderMarkdown("## 安装与配置\n\n### API & 安全\n");
  const toc = extractTableOfContents(html);

  assert.equal(rendererVersion, 7);
  assert.deepEqual(toc.map(({ label, level }) => ({ label, level })), [
    { label: "安装与配置", level: 2 },
    { label: "API & 安全", level: 3 },
  ]);
  for (const item of toc) {
    assert.match(item.id, /^user-content-/);
    assert.ok(html.includes(`id="${item.id}"`));
  }
});

test("renderer v7 bakes Mermaid code blocks into safe light and dark SVGs", async () => {
  const html = await renderMarkdown("```mermaid\nflowchart LR\nA[作者] --> B[内联 SVG]\n```");

  assert.match(html, /<figure class="mermaid-diagram"/);
  assert.match(html, /class="mermaid-light"/);
  assert.match(html, /class="mermaid-dark"/);
  assert.equal((html.match(/<svg\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /language-mermaid/);
  assert.doesNotMatch(html, /<script\b|<foreignObject\b|\son[a-z]+=/i);
});

test("renderer v7 preserves invalid Mermaid as an escaped plain-text code block", async () => {
  const html = await renderMarkdown(
    "```mermaid\nflowchart LR\nA[missing bracket --> B\n```",
  );

  assert.match(html, /class="[^"]*mermaid-fallback/);
  assert.match(html, /missing bracket/);
  assert.doesNotMatch(html, /<figure class="mermaid-diagram"/);
  assert.doesNotMatch(html, /class="language-mermaid"/);
});

test("renderer v7 neutralizes active content embedded in Mermaid source", async () => {
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

test("renderer v7 renders inline and display math as complete KaTeX markup", async () => {
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

test("renderer v7 preserves a malformed formula without aborting the article", async () => {
  const html = await renderMarkdown("正文仍然存在。\n\n$$\\frac{1}{$$");

  assert.match(html, /正文仍然存在/);
  assert.match(html, /class="katex-error"/);
});

test("renderer v7 keeps sanitizing author HTML around math output", async () => {
  const html = await renderMarkdown(
    '<script>alert(1)</script><img src="x" onerror="alert(2)">\n\n$\\href{javascript:alert(3)}{x}$',
  );

  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /href\s*=\s*["']\s*javascript:/i);
});
