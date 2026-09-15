import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_APPEARANCE,
  isLightBackground,
  MAX_BLUR,
  MAX_DIM,
  normalizeAppearance,
  relativeLuminance,
  terminalTheme,
} from "./appearance";

test("stored appearance falls back per field when invalid", () => {
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance("junk"), DEFAULT_APPEARANCE);
  assert.deepEqual(
    normalizeAppearance({ color: "url(javascript:alert(1))", dim: "80", blur: Number.NaN, fit: "stretch" }),
    DEFAULT_APPEARANCE,
  );
});

test("stored appearance keeps valid values and clamps ranges", () => {
  assert.deepEqual(
    normalizeAppearance({ color: "#ABCDEF", dim: 200, blur: -3, fit: "tile" }),
    { color: "#abcdef", dim: MAX_DIM, blur: 0, fit: "tile" },
  );
  assert.equal(normalizeAppearance({ blur: 7.6 }).blur, 8);
  assert.equal(normalizeAppearance({ blur: 99 }).blur, MAX_BLUR);
});

test("luminance separates dark presets from paper white", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.ok(Math.abs(relativeLuminance("#ffffff") - 1) < 1e-9);
  assert.equal(isLightBackground({ ...DEFAULT_APPEARANCE, color: "#f7f5ef" }, false), true);
  assert.equal(isLightBackground({ ...DEFAULT_APPEARANCE, color: "#070b14" }, false), false);
});

test("images always get light text because they sit under a dark overlay", () => {
  const paper = { ...DEFAULT_APPEARANCE, color: "#f7f5ef" };
  assert.equal(isLightBackground(paper, true), false);
  assert.equal(terminalTheme(paper, true).foreground, "#e5e7eb");
  assert.equal(terminalTheme(paper, false).foreground, "#1f2937");
  assert.equal(terminalTheme(paper, false).background, "#00000000");
});
