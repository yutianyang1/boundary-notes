import assert from "node:assert/strict";
import test from "node:test";
import { emptySponsorSlot, localizedSponsor, sponsorSlotSchema } from "./sponsor";

const configured = {
  ...emptySponsorSlot,
  enabled: true,
  label: "赞助",
  title: "某某云",
  description: "一句话说明",
  ctaText: "了解更多",
  linkUrl: "https://example.com",
};

test("中文站始终显示中文文案", () => {
  const copy = localizedSponsor({ ...configured, titleEn: "Some Cloud" }, "zh");
  assert.equal(copy.title, "某某云");
  assert.equal(copy.lang, "zh-CN");
});

test("英文站优先用英文文案", () => {
  const copy = localizedSponsor(
    { ...configured, labelEn: "Sponsor", titleEn: "Some Cloud", descriptionEn: "One line", ctaTextEn: "Learn more" },
    "en",
  );
  assert.deepEqual(
    [copy.label, copy.title, copy.description, copy.ctaText],
    ["Sponsor", "Some Cloud", "One line", "Learn more"],
  );
  assert.equal(copy.lang, "en");
});

test("英文留空时回退中文，并如实标注语言", () => {
  // 标错语言的话，浏览器会把这段中文当英文，不再提示翻译。
  const copy = localizedSponsor(configured, "en");
  assert.equal(copy.title, "某某云");
  assert.equal(copy.lang, "zh-CN");
});

test("部分翻译时逐字段回退", () => {
  const copy = localizedSponsor({ ...configured, titleEn: "Some Cloud" }, "en");
  assert.equal(copy.title, "Some Cloud");
  assert.equal(copy.ctaText, "了解更多");
});

test("存量配置缺英文字段时仍能通过校验", () => {
  // 老数据里没有这几个键，校验失败会让前台按「配置损坏」处理，整个赞助位消失。
  const legacy = {
    enabled: true,
    label: "赞助",
    title: "某某云",
    description: "",
    imageUrl: "",
    linkUrl: "https://example.com",
    ctaText: "了解更多",
  };
  const parsed = sponsorSlotSchema.safeParse(legacy);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.titleEn, "");
});
