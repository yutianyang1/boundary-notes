import assert from "node:assert/strict";
import test from "node:test";
import { diffLines, numberAndCollapseDiff } from "./diff";

test("line diff identifies additions, removals and unchanged lines", () => {
  assert.deepEqual(diffLines(
    "alpha\nold\nshared",
    "alpha\nnew\nshared\nadded",
  ), [
    { type: "equal", value: "alpha" },
    { type: "remove", value: "old" },
    { type: "add", value: "new" },
    { type: "equal", value: "shared" },
    { type: "add", value: "added" },
  ]);
});

test("line diff handles empty documents", () => {
  assert.deepEqual(diffLines("", "first\nsecond"), [
    { type: "add", value: "first" },
    { type: "add", value: "second" },
  ]);
  assert.deepEqual(diffLines("first", ""), [
    { type: "remove", value: "first" },
  ]);
  assert.deepEqual(diffLines("", ""), []);
});

test("line diff can reconstruct both documents with repeated and moved lines", () => {
  const cases = [
    ["same", "same"],
    ["a\nb\na\nc", "a\na\nb\nc"],
    ["keep\nremove one\nremove two\ntail", "prefix\nkeep\ntail"],
    ["one\ntwo\nthree", "zero\none\ntwo\nthree\nfour"],
  ];

  for (const [before, after] of cases) {
    const operations = diffLines(before, after);
    assert.equal(
      operations.filter((operation) => operation.type !== "add").map((operation) => operation.value).join("\n"),
      before,
    );
    assert.equal(
      operations.filter((operation) => operation.type !== "remove").map((operation) => operation.value).join("\n"),
      after,
    );
  }
});

test("numbered diff preserves both line coordinates and collapses distant context", () => {
  const operations = diffLines(
    "one\ntwo\nthree\nfour\nfive\nsix\nseven\nold\ntail",
    "one\ntwo\nthree\nfour\nfive\nsix\nseven\nnew\ntail",
  );
  const rows = numberAndCollapseDiff(operations, 2);

  assert.deepEqual(rows[0], { type: "skip", count: 5 });
  assert.deepEqual(rows[2], {
    type: "equal",
    value: "seven",
    oldLine: 7,
    newLine: 7,
  });
  assert.deepEqual(rows[3], {
    type: "remove",
    value: "old",
    oldLine: 8,
    newLine: null,
  });
  assert.deepEqual(rows[4], {
    type: "add",
    value: "new",
    oldLine: null,
    newLine: 8,
  });
});
