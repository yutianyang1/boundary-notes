import assert from "node:assert/strict";
import test from "node:test";
import {
  buildForgetPostsQuery,
  buildMarkPostReadQuery,
  buildReadPostsQuery,
  readPostsAmong,
} from "./read-progress";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const postIds = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];

test("重置进度的删除语句必须同时限定用户和文章", () => {
  // 少了 user_id 这个条件,一个人点「重置」会清掉所有人的阅读记录。
  const query = buildForgetPostsQuery(userId, postIds).toSQL();
  assert.match(query.sql, /delete from "post_reads"/);
  assert.match(query.sql, /"user_id" = \$1/);
  assert.match(query.sql, /"post_id" in \(/);
  assert.equal(query.params[0], userId);
  assert.ok(postIds.every((id) => query.params.includes(id)));
  assert.ok(!query.params.includes(otherUserId));
});

test("查已读同样按用户隔离", () => {
  const query = buildReadPostsQuery(userId, postIds).toSQL();
  assert.match(query.sql, /from "post_reads"/);
  assert.match(query.sql, /"user_id" = \$1/);
  assert.equal(query.params[0], userId);
});

test("重复标记已读不报错也不覆盖首次时间", () => {
  const query = buildMarkPostReadQuery(userId, postIds[0]).toSQL();
  assert.match(query.sql, /insert into "post_reads"/);
  assert.match(query.sql, /on conflict do nothing/);
  // read_at 走数据库默认值,不作为参数传入——冲突时那一行原样保留。
  assert.match(query.sql, /values \(\$1, \$2, default\)/);
  assert.equal(query.params.length, 2);
});

test("未登录或空列表时不查库", async () => {
  // 走到查询就会碰数据库连接;这里没有连接,能返回说明确实短路了。
  assert.deepEqual(await readPostsAmong(null, postIds), new Set());
  assert.deepEqual(await readPostsAmong(undefined, postIds), new Set());
  assert.deepEqual(await readPostsAmong(userId, []), new Set());
});
