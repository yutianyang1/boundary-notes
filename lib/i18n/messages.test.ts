import assert from "node:assert/strict";
import test from "node:test";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, `${path}.`)) out.set(k, v);
  }
  return out;
}

const zhEntries = flatten(zh as Tree);
const enEntries = flatten(en as Tree);

test("both locales define exactly the same keys", () => {
  const missingInEn = [...zhEntries.keys()].filter((k) => !enEntries.has(k));
  const missingInZh = [...enEntries.keys()].filter((k) => !zhEntries.has(k));
  assert.deepEqual(missingInEn, [], `en.json 缺少：${missingInEn.join(", ")}`);
  assert.deepEqual(missingInZh, [], `zh.json 缺少：${missingInZh.join(", ")}`);
});

test("no message is left empty", () => {
  for (const [locale, entries] of [["zh", zhEntries], ["en", enEntries]] as const) {
    const blank = [...entries].filter(([, value]) => !value.trim()).map(([key]) => key);
    assert.deepEqual(blank, [], `${locale}.json 有空文案：${blank.join(", ")}`);
  }
});

test("placeholders and rich-text tags match across locales", () => {
  // {seconds} 这类插值和 <hl> 这类富文本标签必须两边一致，
  // 少一个会在运行时抛错，多一个会静默丢内容。
  const tokens = (value: string) => [...value.matchAll(/\{(\w+)\}|<\/?(\w+)>/g)]
    .map((m) => m[1] ?? m[2])
    .sort();

  for (const [key, zhValue] of zhEntries) {
    const enValue = enEntries.get(key)!;
    assert.deepEqual(
      tokens(enValue),
      tokens(zhValue),
      `${key} 的占位符/标签不一致：zh=${zhValue} en=${enValue}`,
    );
  }
});

test("english messages carry no leftover Chinese", () => {
  // 语言切换按钮上的「切换到中文」是刻意保留的中文。
  const intentional = new Set(["nav.switchToChinese"]);
  const leftovers = [...enEntries]
    .filter(([key, value]) => !intentional.has(key) && /[一-鿿]/.test(value))
    .map(([key]) => key);
  assert.deepEqual(leftovers, [], `en.json 残留中文：${leftovers.join(", ")}`);
});
