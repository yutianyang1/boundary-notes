import assert from "node:assert/strict";
import test from "node:test";
import { displayDescription, displayName, displayNameLang } from "./display-name";

test("Chinese always shows the Chinese name", () => {
  assert.equal(displayName({ name: "推理优化", nameEn: "Inference optimisation" }, "zh"), "推理优化");
  assert.equal(displayName({ name: "推理优化", nameEn: null }, "zh"), "推理优化");
});

test("English prefers the English name when there is one", () => {
  assert.equal(displayName({ name: "推理优化", nameEn: "Inference optimisation" }, "en"), "Inference optimisation");
});

test("English falls back to Chinese rather than showing nothing", () => {
  // 多数分类不会被翻译；回退保证英文站不出现空标签。
  assert.equal(displayName({ name: "推理优化", nameEn: null }, "en"), "推理优化");
  assert.equal(displayName({ name: "推理优化", nameEn: "" }, "en"), "推理优化");
  assert.equal(displayName({ name: "推理优化", nameEn: "   " }, "en"), "推理优化");
  assert.equal(displayName({ name: "推理优化" }, "en"), "推理优化");
});

test("descriptions follow the same fallback", () => {
  assert.equal(displayDescription({ description: "中文说明", descriptionEn: "English" }, "en"), "English");
  assert.equal(displayDescription({ description: "中文说明", descriptionEn: null }, "en"), "中文说明");
  assert.equal(displayDescription({ description: null, descriptionEn: null }, "en"), null);
  assert.equal(displayDescription({ description: "中文说明", descriptionEn: "English" }, "zh"), "中文说明");
});

test("lang reflects what is actually rendered, not the interface", () => {
  // 回退到中文名时必须如实标注，浏览器才会对它提示翻译。
  assert.equal(displayNameLang({ name: "推理优化", nameEn: "Inference optimisation" }, "en"), "en");
  assert.equal(displayNameLang({ name: "推理优化", nameEn: null }, "en"), "zh-CN");
  assert.equal(displayNameLang({ name: "推理优化", nameEn: "Inference optimisation" }, "zh"), "zh-CN");
});
