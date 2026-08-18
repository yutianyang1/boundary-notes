import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublishedPostRedirectQuery,
  buildPublishedCategoryListQuery,
  buildPublishedPostsForCategoryQuery,
  buildPublishedSeriesListQuery,
  buildPublishedSeriesPostsQuery,
  buildVisibleSeriesMembersQuery,
  selectSeriesNavigation,
} from "./queries";

const id = "11111111-1111-4111-8111-111111111111";

function assertPublicVisibility(sql: string, params: unknown[]) {
  assert.match(sql, /"posts"\."deleted_at" is null/);
  assert.match(sql, /"posts"\."published_at" <= now\(\)/);
  assert.ok(params.includes("published"));
  assert.ok(params.includes("scheduled"));
}

test("category list counts only public posts and orders by count then name", () => {
  const query = buildPublishedCategoryListQuery().toSQL();
  assertPublicVisibility(query.sql, query.params);
  assert.match(query.sql, /"categories"\."deleted_at" is null/);
  assert.match(query.sql, /count\("posts"\."id"\) desc, "categories"\."name"/);
  assert.match(query.sql, /"categories"\."description"/);
});

test("historical post slugs resolve only to a currently public post", () => {
  const query = buildPublishedPostRedirectQuery("old-slug").toSQL();
  assertPublicVisibility(query.sql, query.params);
  assert.match(query.sql, /from "post_redirects" inner join "posts"/);
  assert.match(query.sql, /"post_redirects"\."old_slug" = \$1/);
  assert.equal(query.params[0], "old-slug");
});

test("historical post slugs are decoded before querying redirects", () => {
  const query = buildPublishedPostRedirectQuery("app%E6%8E%A5%E5%85%A5deepagent").toSQL();
  assert.equal(query.params[0], "app接入deepagent");
});

test("category detail uses the shared public visibility and post-card ordering", () => {
  const query = buildPublishedPostsForCategoryQuery(id, 25).toSQL();
  assertPublicVisibility(query.sql, query.params);
  assert.match(query.sql, /"categories"\."id" = \$1/);
  assert.match(query.sql, /"posts"\."pinned" desc, "posts"\."published_at" desc/);
  assert.equal(query.params.at(-1), 25);
});

test("series list counts only public members from active series", () => {
  const query = buildPublishedSeriesListQuery().toSQL();
  assertPublicVisibility(query.sql, query.params);
  assert.match(query.sql, /"series"\."deleted_at" is null/);
  assert.match(query.sql, /count\("posts"\."id"\) desc, "series"\."name"/);
});

test("series detail orders members by explicit position with stable fallbacks", () => {
  const query = buildPublishedSeriesPostsQuery(id, 40).toSQL();
  assertPublicVisibility(query.sql, query.params);
  assert.match(
    query.sql,
    /order by "posts"\."series_order" asc, "posts"\."published_at" asc, "posts"\."id" asc/,
  );
  assert.equal(query.params.at(-1), 40);
});

test("series navigation query excludes hidden members and uses series order", () => {
  const query = buildVisibleSeriesMembersQuery(id).toSQL();
  assertPublicVisibility(query.sql, query.params);
  assert.match(
    query.sql,
    /order by "posts"\."series_order" asc, "posts"\."published_at" asc, "posts"\."id" asc/,
  );
});

test("series navigation handles first, last and an omitted invisible member", () => {
  const publicMembers = [
    { id: "first", slug: "first", title: "第一篇" },
    // 草稿或未到点成员不会进入公开查询结果。
    { id: "last", slug: "last", title: "最后一篇" },
  ];

  assert.deepEqual(selectSeriesNavigation(publicMembers, "first"), {
    total: 2,
    position: 1,
    prev: null,
    next: { slug: "last", title: "最后一篇" },
    postIds: ["first", "last"],
  });
  assert.deepEqual(selectSeriesNavigation(publicMembers, "last"), {
    total: 2,
    position: 2,
    prev: { slug: "first", title: "第一篇" },
    next: null,
    postIds: ["first", "last"],
  });
  assert.equal(selectSeriesNavigation(publicMembers, "hidden-draft"), null);
});

test("导航带出全部公开成员的 id,不只是上下篇", () => {
  // 进度按这批 id 去数已读;少一篇就会把「已读 2 / 3」算成「2 / 2」,
  // 直接显示成整个系列读完了。
  const members = [
    { id: "a", slug: "first", title: "一" },
    { id: "b", slug: "second", title: "二" },
    { id: "c", slug: "third", title: "三" },
  ];
  assert.deepEqual(selectSeriesNavigation(members, "b")?.postIds, ["a", "b", "c"]);
});
