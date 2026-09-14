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

// 以下三条的元数据形态照抄线上三篇规格文档的开头：引用块 + 硬换行、引用块
// 分段、普通段落 + 硬换行。
test("excerptFromMarkdown skips a leading metadata block inside a blockquote", () => {
  const markdown = [
    "# 自然语言输入理解与规范化层设计（原有链路）",
    "",
    "> 状态：设计稿  ",
    "> 适用项目：`lanque-app`  ",
    "> 适用运行时：原有 `OpenAiIpcClient` 链路  ",
    "> 更新日期：2026-08-19",
    "",
    "## 1. 背景与目标",
    "",
    "自然语言是信息化交互的第一道关口。",
  ].join("\n");
  assert.equal(excerptFromMarkdown(markdown), "自然语言是信息化交互的第一道关口。");
});

test("excerptFromMarkdown skips metadata written as separate quoted paragraphs", () => {
  const markdown = "> 状态：调研结论与实施草案\n>\n> 日期：2026-08-12\n>\n> 目标项目：lanque-app\n\n## 1. 结论先行\n\n这套系统可以接入。";
  assert.equal(excerptFromMarkdown(markdown), "这套系统可以接入。");
});

test("excerptFromMarkdown skips metadata lines joined by backslash hard breaks", () => {
  const markdown = "版本：1.0\\\n状态：客户端已实现\\\n适用范围：Lanque App 回答卡片操作区\n\n## 1. 目标与边界\n\n回答操作事件用于在最终回答中提供入口。";
  assert.equal(excerptFromMarkdown(markdown), "回答操作事件用于在最终回答中提供入口。");
});

test("excerptFromMarkdown keeps a labelled sentence that is real prose", () => {
  assert.equal(excerptFromMarkdown("注意：这里的缓存不会失效。"), "注意：这里的缓存不会失效。");
});

test("excerptFromMarkdown keeps field-like lines once prose has started", () => {
  const markdown = "配置项如下。\n\n超时：30 秒";
  assert.equal(excerptFromMarkdown(markdown), "配置项如下。 超时：30 秒");
});

test("excerptFromMarkdown does not leave a dangling comma before the ellipsis", () => {
  const excerpt = excerptFromMarkdown("提供查看详情、修改展示、继续处理、确认执行等入口", 17);
  assert.equal(excerpt, "提供查看详情、修改展示、继续处理…");
});

test("excerptFromMarkdown returns empty string for content with no prose", () => {
  assert.equal(excerptFromMarkdown(""), "");
  assert.equal(excerptFromMarkdown("---\n\n***\n"), "");
});
