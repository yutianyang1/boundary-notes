import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyViewSeries, shanghaiDayKey } from "./view-analytics";

test("Shanghai day keys roll over at UTC+8 midnight", () => {
  assert.equal(shanghaiDayKey(new Date("2026-07-30T15:59:59.000Z")), "2026-07-30");
  assert.equal(shanghaiDayKey(new Date("2026-07-30T16:00:00.000Z")), "2026-07-31");
});

test("daily view series fills missing Shanghai days without inventing history", () => {
  const series = buildDailyViewSeries(
    [
      { day: "2026-07-27", viewCount: 3 },
      { day: "2026-07-29", viewCount: 8 },
    ],
    4,
    new Date("2026-07-30T08:00:00.000Z"),
  );

  assert.deepEqual(series, [
    { day: "2026-07-27", viewCount: 3 },
    { day: "2026-07-28", viewCount: 0 },
    { day: "2026-07-29", viewCount: 8 },
    { day: "2026-07-30", viewCount: 0 },
  ]);
});
