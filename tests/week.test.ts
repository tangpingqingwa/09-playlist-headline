import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getBoardListings } from "../src/core/rank";
import { applyPaidEvent, resetListings } from "../src/core/store";
import {
  ROLLING_WEEK_MS,
  bidInRollingWeek,
  currentWeekUtc,
  isoWeekId,
  isoWeekMondayUtc,
  nextMondayUtc,
  nowUtc,
  rollingWeekStart,
} from "../src/core/week";

afterEach(() => {
  resetListings();
});

test("Monday 00:00 UTC is included in the new ISO week", () => {
  assert.equal(isoWeekId(new Date("2026-08-17T00:00:00.000Z")), "2026-W34");
  assert.equal(isoWeekId(new Date("2026-08-16T23:59:59.999Z")), "2026-W33");
});

test("Sunday is still the previous ISO week until Monday UTC", () => {
  assert.equal(isoWeekId(new Date("2026-08-23T23:59:59.999Z")), "2026-W34");
  assert.equal(isoWeekId(new Date("2026-08-24T00:00:00.000Z")), "2026-W35");
});

test("next Monday 00:00 UTC is a weekId label boundary, not rank expiry", () => {
  const monday = new Date("2026-08-17T00:00:00.000Z");
  const sunday = new Date("2026-08-23T12:00:00.000Z");
  assert.equal(nextMondayUtc(monday).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(nextMondayUtc(sunday).toISOString(), "2026-08-24T00:00:00.000Z");
  const week = currentWeekUtc(monday);
  assert.equal(week.weekId, "2026-W34");
  assert.equal(week.startsAt.toISOString(), rollingWeekStart(monday).toISOString());
  assert.equal(week.nextResetAt.toISOString(), "2026-08-24T00:00:00.000Z");
});

test("WEEK_NOW is the documented operator / test clock", () => {
  const previous = process.env.WEEK_NOW;
  process.env.WEEK_NOW = "2026-08-16T23:59:59.999Z";
  try {
    assert.equal(nowUtc().toISOString(), "2026-08-16T23:59:59.999Z");
    assert.equal(isoWeekId(nowUtc()), "2026-W33");
    process.env.WEEK_NOW = "2026-08-17T00:00:00.000Z";
    assert.equal(isoWeekId(nowUtc()), "2026-W34");
  } finally {
    if (previous === undefined) {
      delete process.env.WEEK_NOW;
    } else {
      process.env.WEEK_NOW = previous;
    }
  }
});

test("rolling last-7-days window is 7 * 24h, not Monday 00:00 UTC", () => {
  const now = new Date("2026-08-24T00:00:00.000Z");
  assert.equal(ROLLING_WEEK_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(
    rollingWeekStart(now).toISOString(),
    "2026-08-17T00:00:00.000Z",
  );
  assert.equal(bidInRollingWeek("2026-08-17T00:00:00.000Z", now), true);
  assert.equal(bidInRollingWeek("2026-08-16T23:59:59.000Z", now), false);
  assert.equal(bidInRollingWeek("2026-08-23T23:59:59.000Z", now), true);
  assert.equal(bidInRollingWeek("2026-08-24T00:00:01.000Z", now), false);
  assert.equal(
    isoWeekMondayUtc("2026-W34").toISOString(),
    "2026-08-17T00:00:00.000Z",
  );
});

test("Monday 00:00 UTC does not drop a bid still inside the rolling week", () => {
  const sundayPay = "2026-08-16T12:00:00.000Z";
  const mondayMidnight = new Date("2026-08-17T00:00:00.000Z");
  assert.equal(bidInRollingWeek(sundayPay, mondayMidnight), true);
  assert.equal(
    bidInRollingWeek(sundayPay, new Date("2026-08-23T12:00:00.000Z")),
    true,
  );
  assert.equal(
    bidInRollingWeek(sundayPay, new Date("2026-08-23T12:00:01.000Z")),
    false,
  );
});

test("live board keeps a Sunday pay across Monday 00:00 UTC and drops it after 7 days", () => {
  applyPaidEvent({
    sessionId: "chk_sunday",
    weekId: "2026-W33",
    track: "Sunday Open",
    artist: "Ada",
    listenUrl: "https://example.com/sunday-open",
    amountUsd: 12,
    paidAt: "2026-08-16T12:00:00.000Z",
    kind: "create",
  });
  applyPaidEvent({
    sessionId: "chk_stale",
    weekId: "2026-W32",
    track: "Stale Open",
    artist: "Bea",
    listenUrl: "https://example.com/stale-open",
    amountUsd: 50,
    paidAt: "2026-08-09T12:00:00.000Z",
    kind: "create",
  });

  const monday = getBoardListings(new Date("2026-08-17T00:00:00.000Z"));
  assert.equal(monday.length, 1);
  assert.equal(monday[0]?.track, "Sunday Open");
  assert.equal(monday[0]?.bidUsd, 12);

  const stillLive = getBoardListings(new Date("2026-08-23T12:00:00.000Z"));
  assert.equal(stillLive.length, 1);
  assert.equal(stillLive[0]?.track, "Sunday Open");

  const aged = getBoardListings(new Date("2026-08-23T12:00:01.000Z"));
  assert.equal(aged.length, 0);
});
