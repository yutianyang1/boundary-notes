import assert from "node:assert/strict";
import test from "node:test";
import { excerptFromMarkdown } from "./excerpt";

test("excerptFromMarkdown skips headings and takes the first prose", () => {
  const markdown = "# 标题\n\n这是正文第一段，讲清楚这篇文章要解决什么问题。\n";
  assert.equal(
    excerptFromMarkdown(markdown),
    "这是正文第一段，讲清楚这篇文章要解决什么问题。",
  );
});

test("excerptFromMarkdown drops fenced code, front matter and tables", () => {
  const markdown = [
    "---",
    "draft: true",
    "---",
    "",
    "```ts",
    "const answer = 42;",
    "```",
    "",
    "| 列 | 值 |",
    "| --- | --- |",
    "",
    "真正的正文在这里。",
  ].join("\n");
  assert.equal(excerptFromMarkdown(markdown), "真正的正文在这里。");
});

test("excerptFromMarkdown unwraps inline markup but keeps the words", () => {
  const markdown = "看 [这篇文章](https://example.com/a) 里的 `useMemo` 和 **重点**。";
  assert.equal(excerptFromMarkdown(markdown), "看 这篇文章 里的 useMemo 和 重点。");
});

test("excerptFromMarkdown drops image syntax without leaving the alt text bracket", () => {
  const markdown = "![架构图](/media/arch.png)\n\n图上画的是三段式流水线。";
  assert.equal(excerptFromMarkdown(markdown), "图上画的是三段式流水线。");
});

test("excerptFromMarkdown breaks on a sentence end when it has to truncate", () => {
  const markdown = "第一句话到此为止。第二句话会把长度推过上限，所以应该被整句丢掉，而不是切一半。";
  assert.equal(excerptFromMarkdown(markdown, 16), "第一句话到此为止。");
});

test("excerptFromMarkdown ignores a sentence end that lands too early to be useful", () => {
  // 句号在第 9 个字，上限 20 —— 就着它截会只剩不到一半的篇幅，这时宁可省略号。
  const markdown = "第一句话到此为止。第二句话会把长度推过上限，所以应该被整句丢掉，而不是切一半。";
  assert.equal(excerptFromMarkdown(markdown, 20), "第一句话到此为止。第二句话会把长度推过上…");
});

test("excerptFromMarkdown falls back to an ellipsis when no sentence end fits", () => {
  const excerpt = excerptFromMarkdown("一二三四五六七八九十一二三四五六七八九十", 10);
  assert.equal(excerpt, "一二三四五六七八九十…");
});

test("excerptFromMarkdown joins short lines until it has enough text", () => {
  // 单独一行往往是个小标题，凑不满卡片的两行，所以要接着往下取。
  const markdown = "短句一。\n\n短句二。\n\n短句三。";
  assert.equal(excerptFromMarkdown(markdown, 12), "短句一。 短句二。");
  assert.equal(excerptFromMarkdown(markdown, 40), "短句一。 短句二。 短句三。");
});

test("excerptFromMarkdown returns empty string for content with no prose", () => {
  assert.equal(excerptFromMarkdown(""), "");
  assert.equal(excerptFromMarkdown("---\n\n***\n"), "");
});
