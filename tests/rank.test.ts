import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Board } from "../src/app/page";
import {
  getBoardListings,
  listingsForWeek,
  rankListings,
  type Listing,
} from "../src/core/rank";
import { resetListings } from "../src/core/store";
import { currentWeekUtc, isoWeekId, nextMondayUtc } from "../src/core/week";

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

const WEEK = "2026-W34";
const NEXT_RESET = "2026-08-24T00:00:00.000Z";
const NOW = new Date("2026-08-20T12:00:00.000Z");
const formSource = readFileSync(
  join(process.cwd(), "src", "app", "outbid-form.tsx"),
  "utf8",
);

const FORBIDDEN =
  /play count|stream count|monthly listeners|1\.2M streams|fake stream|<audio|waveform/i;

function listing(
  partial: Partial<Listing> & Pick<Listing, "id" | "bidUsd" | "firstPaidAt">,
): Listing {
  return {
    weekId: WEEK,
    track: partial.track ?? `Track ${partial.id}`,
    artist: partial.artist ?? `Artist ${partial.id}`,
    listenUrl: partial.listenUrl ?? `https://example.com/${partial.id}`,
    lastPaidAt: partial.lastPaidAt ?? partial.firstPaidAt,
    clicks: partial.clicks ?? 0,
    ...partial,
  };
}

function renderBoard(listings: Listing[], weekId = WEEK): string {
  return renderToStaticMarkup(
    createElement(Board, {
      weekId,
      nextResetAt: NEXT_RESET,
      listings: rankListings(listingsForWeek(listings, NOW)),
    }),
  );
}

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
  assert.equal(nextMondayUtc(monday).toISOString(), NEXT_RESET);
  assert.equal(nextMondayUtc(sunday).toISOString(), NEXT_RESET);
  const week = currentWeekUtc(monday);
  assert.equal(week.weekId, WEEK);
  assert.equal(week.startsAt.toISOString(), "2026-08-10T00:00:00.000Z");
  assert.equal(week.nextResetAt.toISOString(), NEXT_RESET);
});

test("higher bid ranks above; below-#1 still lists", () => {
  const ranked = rankListings([
    listing({
      id: "a",
      track: "Five Dollar",
      bidUsd: 5,
      firstPaidAt: "2026-08-17T00:00:00.000Z",
      clicks: 900,
    }),
    listing({
      id: "b",
      track: "Twelve Dollar",
      bidUsd: 12,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
      clicks: 0,
    }),
  ]);
  assert.deepEqual(
    ranked.map((row) => ({ id: row.id, rank: row.rank, bidUsd: row.bidUsd })),
    [
      { id: "b", rank: 1, bidUsd: 12 },
      { id: "a", rank: 2, bidUsd: 5 },
    ],
  );
});

test("equal bids: older firstPaidAt stays above, then id ASC", () => {
  const ranked = rankListings([
    listing({
      id: "newer",
      bidUsd: 12,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
      clicks: 40,
    }),
    listing({
      id: "older",
      bidUsd: 12,
      firstPaidAt: "2026-08-17T00:00:00.000Z",
      clicks: 0,
    }),
    listing({
      id: "b",
      bidUsd: 12,
      firstPaidAt: "2026-08-17T00:00:00.000Z",
    }),
    listing({
      id: "a",
      bidUsd: 12,
      firstPaidAt: "2026-08-17T00:00:00.000Z",
    }),
  ]);
  assert.deepEqual(
    ranked.map((row) => row.id),
    ["a", "b", "older", "newer"],
  );
  assert.equal(ranked[0]?.rank, 1);
});

test("rankListings does not mutate the input", () => {
  const rows = [
    listing({ id: "z", bidUsd: 5, firstPaidAt: "2026-08-18T00:00:00.000Z" }),
    listing({ id: "y", bidUsd: 8, firstPaidAt: "2026-08-17T00:00:00.000Z" }),
  ];
  const before = rows.map((row) => row.id);
  rankListings(rows);
  assert.deepEqual(
    rows.map((row) => row.id),
    before,
  );
});

test("only the rolling last 7 days is ranked on the live board", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const ranked = rankListings(
    listingsForWeek(
      [
        listing({
          id: "aged-out",
          weekId: "2026-W33",
          bidUsd: 50,
          firstPaidAt: "2026-08-10T11:59:59.000Z",
        }),
        listing({
          id: "still-live",
          weekId: "2026-W33",
          bidUsd: 8,
          firstPaidAt: "2026-08-16T12:00:00.000Z",
        }),
        listing({
          id: "this-week",
          weekId: WEEK,
          bidUsd: 5,
          firstPaidAt: "2026-08-17T00:00:00.000Z",
        }),
      ],
      now,
    ),
  );
  assert.deepEqual(
    ranked.map((row) => row.id),
    ["still-live", "this-week"],
  );
});

test("live board loader invents no tracks", () => {
  resetListings();
  assert.deepEqual(getBoardListings(), []);
  assert.deepEqual(getBoardListings(new Date("2026-08-10T00:00:00.000Z")), []);
});

test("unpaid Polar checkout never ranks as #1", () => {
  const unpaid = listing({
    id: "lst_unpaid",
    track: "Ghost Track",
    artist: "Vapor",
    bidUsd: 99,
    firstPaidAt: "",
  });
  const abandoned = listing({
    id: "lst_abandoned",
    track: "Abandoned Open",
    artist: "Ghost",
    bidUsd: 12,
    firstPaidAt: "not-a-date",
  });
  const paid = listing({
    id: "lst_paid_only",
    track: "Cold Open",
    artist: "Ada",
    bidUsd: 5,
    firstPaidAt: "2026-08-17T00:00:00.000Z",
  });
  assert.deepEqual(rankListings([unpaid, abandoned]), []);
  const ranked = rankListings([unpaid, abandoned, paid]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.id, "lst_paid_only");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.bidUsd, 5);
  assert.doesNotMatch(
    ranked.map((row) => row.id).join(","),
    /lst_unpaid|lst_abandoned/,
  );
});

test("empty week renders the form and no opening song", () => {
  const html = renderBoard([]);
  assert.match(html, /data-empty-week="true"/);
  assert.match(html, /data-opening-song="false"/);
  assert.match(html, /No opening song/);
  assert.match(html, /Outbid/);
  assert.match(html, /2026-W34/);
  assert.match(formSource, /name="track"/);
  assert.match(formSource, /name="artist"/);
  assert.match(formSource, /name="listenUrl"/);
  assert.match(formSource, /name="amountUsd"/);
  assert.match(formSource, /Outbid/);
  assert.doesNotMatch(html, /data-listing-card/);
  assert.doesNotMatch(html, /data-listen-url/);
  assert.doesNotMatch(html, FORBIDDEN);
  assert.doesNotMatch(formSource, FORBIDDEN);
});

test("cards show money and clicks, not play counts", () => {
  const html = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 5,
      clicks: 3,
      firstPaidAt: "2026-08-17T00:00:00.000Z",
    }),
  ]);
  assert.match(html, /data-opening-song="true"/);
  assert.match(html, /Cold Open/);
  assert.match(html, /Ada/);
  assert.match(html, /\$5/);
  assert.match(html, /3 clicks/);
  assert.match(html, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.doesNotMatch(html, FORBIDDEN);
  assert.doesNotMatch(html, /\bplays\b/i);
});

test("board markup sorts by bid, then older firstPaidAt", () => {
  const html = renderBoard([
    listing({
      id: "lst_new",
      track: "Newer Eight",
      bidUsd: 8,
      firstPaidAt: "2026-08-19T00:00:00.000Z",
    }),
    listing({
      id: "lst_five",
      track: "Five Dollar",
      bidUsd: 5,
      firstPaidAt: "2026-08-17T00:00:00.000Z",
    }),
    listing({
      id: "lst_old",
      track: "Older Eight",
      bidUsd: 8,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  const first = html.indexOf('data-id="lst_old"');
  const second = html.indexOf('data-id="lst_new"');
  const third = html.indexOf('data-id="lst_five"');
  assert.ok(first >= 0 && second >= 0 && third >= 0);
  assert.ok(first < second && second < third);
  assert.match(html, /\$8/);
  assert.match(html, /\$5/);
  assert.doesNotMatch(html, FORBIDDEN);
});
