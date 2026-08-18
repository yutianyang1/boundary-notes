import assert from "node:assert/strict";
import test from "node:test";
import {
  READ_POSTS_LIMIT,
  countRead,
  forgetPosts,
  isPostRead,
  markPostRead,
  parseReadPosts,
} from "./read-progress";

test("坏掉的存储内容一律当成空进度,不抛错", () => {
  // 这份数据存在读者浏览器里,我们改不到也修不了;
  // 任何一种损坏都不能让整页崩掉。
  assert.deepEqual(parseReadPosts(null), {});
  assert.deepEqual(parseReadPosts(""), {});
  assert.deepEqual(parseReadPosts("not json"), {});
  assert.deepEqual(parseReadPosts("[1,2,3]"), {});
  assert.deepEqual(parseReadPosts('"just-a-string"'), {});
  assert.deepEqual(parseReadPosts("null"), {});
});

test("逐条剔除无效记录,保留同一份里正常的部分", () => {
  assert.deepEqual(
    parseReadPosts('{"good":1700000000000,"empty-value":"x","nan":null,"":123}'),
    { good: 1700000000000 },
  );
});

test("存储里的 __proto__ 不会改到对象原型上", () => {
  const state = parseReadPosts('{"__proto__":{"polluted":1},"real":1}');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(isPostRead(state, "real"), true);
});

test("已读过的文章不再产生写入", () => {
  const state = { "已读的文章": 1_000 };
  assert.equal(markPostRead(state, "已读的文章", 2_000), null);
  assert.equal(markPostRead(state, "", 2_000), null);
  assert.deepEqual(markPostRead(state, "新文章", 2_000), { "已读的文章": 1_000, "新文章": 2_000 });
});

test("超出上限时丢掉最旧的,不丢刚读完的那篇", () => {
  const state: Record<string, number> = {};
  for (let i = 0; i < READ_POSTS_LIMIT; i += 1) state[`post-${i}`] = i + 1;
  const next = markPostRead(state, "刚读完", 999_999);
  assert.ok(next);
  assert.equal(Object.keys(next).length, READ_POSTS_LIMIT);
  assert.equal(isPostRead(next, "刚读完"), true);
  assert.equal(isPostRead(next, "post-0"), false, "最旧的一条应当被挤掉");
  assert.equal(isPostRead(next, "post-1"), true);
});

test("系列进度只数这个系列里的文章", () => {
  const state = { a: 1, c: 1, "别的系列": 1 };
  assert.equal(countRead(state, ["a", "b", "c", "d"]), 2);
  assert.equal(countRead(state, []), 0);
});

test("重置只清掉传入的 slug,别的系列不受影响", () => {
  const state = { a: 1, b: 1, "别的系列": 1 };
  assert.deepEqual(forgetPosts(state, ["a", "b"]), { "别的系列": 1 });
  assert.equal(forgetPosts(state, ["从没读过"]), null, "无变化时应返回 null,免去一次写入");
});
