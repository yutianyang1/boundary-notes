import assert from "node:assert/strict";
import test from "node:test";
import { splitAtColon, titleTokens } from "./title-breaks";

/** 把 token 序列画成字符串，「|」表示允许在此换行，[] 表示整体不断。 */
function render(text: string) {
  return titleTokens(text)
    .map((t) => `${t.breakBefore ? "|" : ""}${t.keepTogether ? `[${t.text}]` : t.text}`)
    .join("");
}

test("titleTokens never offers a break inside a Chinese word", () => {
  const drawn = render("把注意力的瓶颈从算力挪回访存");
  assert.ok(drawn.includes("注意力"), drawn);
  assert.ok(drawn.includes("瓶颈"), drawn);
});

test("titleTokens does not split a word the dictionary cut into single characters", () => {
  // ICU 词典把「实时」切成「实|时」，线上因此出现过「实 / 时语音架构」。
  const drawn = render("我的 Barge-in 实时语音架构");
  assert.ok(!drawn.includes("实|时"), drawn);
});

test("titleTokens still offers breaks inside a long run of single characters", () => {
  const tokens = titleTokens("从算力挪回访存的一二三四五六");
  const longest = Math.max(...tokens.map((t) => t.text.length));
  assert.ok(longest <= 4, JSON.stringify(tokens.map((t) => t.text)));
});

test("titleTokens keeps a hyphenated Latin word together", () => {
  const drawn = render("我的 Barge-in 实时语音架构");
  assert.ok(drawn.includes("[Barge-in]"), drawn);
});

test("titleTokens allows a break before an opening quote but not after it", () => {
  const tokens = titleTokens("真正“听得见”");
  const quote = tokens.find((t) => t.text.startsWith("“"))!;
  assert.equal(quote.breakBefore, true);
  const afterQuote = tokens[tokens.indexOf(quote) + 1];
  assert.equal(afterQuote.breakBefore, false);
});

test("titleTokens allows a break after closing punctuation but not before it", () => {
  const tokens = titleTokens("听得见”：我的");
  // 「”」「：」都不能出现在行首
  for (const t of tokens.filter((t) => /[”：]/.test(t.text))) assert.equal(t.breakBefore, false, t.text);
  // 两个闭标点之后的「我的」可以换行
  assert.equal(tokens.find((t) => t.text === "我的")?.breakBefore, true);
});

test("titleTokens does not pin very long Latin runs, so narrow screens can still wrap", () => {
  const tokens = titleTokens("接入 blueAgent/DeepAgents/LangGraph 调研");
  const long = tokens.find((t) => t.text.includes("/"))!;
  assert.equal(long.keepTogether, false);
});

test("titleTokens reproduces the original text exactly", () => {
  const title = "Stable LatentMoE：896 选 16 的极端稀疏怎么才不训崩";
  assert.equal(titleTokens(title).map((t) => t.text).join(""), title);
});

test("splitAtColon separates topic and subtitle on the full-width colon", () => {
  assert.deepEqual(splitAtColon("FlashAttention：把注意力的瓶颈从算力挪回访存"), [
    "FlashAttention：",
    "把注意力的瓶颈从算力挪回访存",
  ]);
  assert.equal(splitAtColon("lanquev2 新需求"), null);
  assert.equal(splitAtColon("：开头的冒号"), null);
  assert.equal(splitAtColon("结尾的冒号："), null);
});
