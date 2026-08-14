import assert from "node:assert/strict";
import test from "node:test";
import { readingMetaValues, readingMinutes } from "./reading-time";

test("readingMinutes keeps the estimate at one minute or more", () => {
  assert.equal(readingMinutes(0), 1);
  assert.equal(readingMinutes(800), 2);
});

test("readingMetaValues selects exact and compact character messages", () => {
  assert.deepEqual(readingMetaValues(999), {
    key: "readingMeta",
    minutes: 2,
    count: 999,
  });
  assert.deepEqual(readingMetaValues(3_200), {
    key: "readingMetaThousands",
    minutes: 8,
    count: "3.2",
  });
});
