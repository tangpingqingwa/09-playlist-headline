import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as getClick } from "../src/app/click/[id]/route";
import HomePage from "../src/app/page";
import { listenClickPath } from "../src/core/playback";
import { getBoardListings, rankListings } from "../src/core/rank";
import { applyPaidEvent, getListingById, resetListings } from "../src/core/store";
import { currentWeekUtc } from "../src/core/week";

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

const { Board } = HomePage;

afterEach(() => {
  resetListings();
});

function weekId(): string {
  return currentWeekUtc().weekId;
}

test("GET /click/:id 302s to the stripped listen URL and increments clicks", async () => {
  const listing = applyPaidEvent({
    sessionId: "chk_click",
    weekId: weekId(),
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open?utm_source=board&fbclid=1#frag",
    amountUsd: 5,
    paidAt: "2026-08-17T09:00:00.000Z",
    kind: "create",
  });
  assert.equal(listing.listenUrl, "https://example.com/cold-open");
  assert.equal(listing.clicks, 0);
  assert.equal(listenClickPath(listing.id), `/click/${listing.id}`);

  const response = await getClick(new Request(`http://localhost/click/${listing.id}`), {
    params: Promise.resolve({ id: listing.id }),
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.com/cold-open");
  assert.doesNotMatch(response.headers.get("location") ?? "", /utm_/);
  assert.equal(getListingById(listing.id)?.clicks, 1);

  const again = await getClick(new Request(`http://localhost/click/${listing.id}`), {
    params: Promise.resolve({ id: listing.id }),
  });
  assert.equal(again.status, 302);
  assert.equal(getListingById(listing.id)?.clicks, 2);
  assert.equal(getBoardListings()[0]?.clicks, 2);
});

test("unknown listing click is 404 and does not invent a hop", async () => {
  const missing = await getClick(new Request("http://localhost/click/missing"), {
    params: Promise.resolve({ id: "missing" }),
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "listing_not_found" });
});

test("board listen CTA uses the click route and does not label clicks as plays", () => {
  const listing = applyPaidEvent({
    sessionId: "chk_ui_click",
    weekId: weekId(),
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    amountUsd: 5,
    paidAt: "2026-08-17T09:00:00.000Z",
    kind: "create",
  });
  const html = renderToStaticMarkup(
    createElement(Board, {
      weekId: weekId(),
      nextResetAt: "2026-08-24T00:00:00.000Z",
      listings: rankListings(getBoardListings()),
    }),
  );
  assert.match(html, new RegExp(`href="/click/${listing.id}"`));
  assert.match(html, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(html, /0 clicks/);
  assert.doesNotMatch(html, /\bplays\b/i);
  assert.doesNotMatch(html, /\bstreams\b/i);
  assert.doesNotMatch(html, /play count/i);
});
