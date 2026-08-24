import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AboutPage from "../src/app/about/page";
import { Board } from "../src/app/page";
import RulesPage from "../src/app/rules/page";
import {
  assertRealPlayback,
  officialEmbedUrl,
  playbackForListing,
} from "../src/core/playback";
import { rankListings, type Listing } from "../src/core/rank";
import { applyPaidEvent, resetListings } from "../src/core/store";
import { currentWeekUtc } from "../src/core/week";

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

afterEach(() => {
  resetListings();
});

const WEEK = "2026-W34";
const NEXT_RESET = "2026-08-24T00:00:00.000Z";

function listing(partial: Partial<Listing> & Pick<Listing, "id" | "listenUrl">): Listing {
  return {
    weekId: WEEK,
    track: partial.track ?? "Cold Open",
    artist: partial.artist ?? "Ada",
    bidUsd: partial.bidUsd ?? 5,
    firstPaidAt: partial.firstPaidAt ?? "2026-08-17T00:00:00.000Z",
    lastPaidAt: partial.lastPaidAt ?? "2026-08-17T00:00:00.000Z",
    clicks: partial.clicks ?? 0,
    ...partial,
  };
}

test("empty week has no player and no invented stream", () => {
  assert.deepEqual(playbackForListing(undefined), { kind: "empty" });
  const html = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
    }),
  );
  assert.match(html, /data-empty-week="true"/);
  assert.match(html, /No opening song/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /<audio/);
  assert.doesNotMatch(html, /data-listen-url/);
  assert.doesNotMatch(html, /fake stream/i);
});

test("player and embed target the stored listen URL; no generated file", () => {
  const youtube =
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const embed = officialEmbedUrl(youtube);
  assert.equal(embed, "https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.deepEqual(playbackForListing({ listenUrl: youtube }), {
    kind: "embed",
    listenUrl: youtube,
    embedUrl: embed,
  });
  assert.equal(assertRealPlayback(youtube), youtube);

  const generic = "https://example.com/cold-open";
  assert.equal(officialEmbedUrl(generic), undefined);
  assert.deepEqual(playbackForListing({ listenUrl: generic }), {
    kind: "redirect",
    listenUrl: generic,
  });

  assert.throws(() => assertRealPlayback("https://example.com/generated.mp3"), /fake stream/);
  assert.throws(() => playbackForListing({ listenUrl: "data:audio/wav;base64,AAA" }), /fake stream/);
});

test("opening-song embed uses the stored listen URL, not a generated file", () => {
  const listenUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const html = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: rankListings([
        listing({
          id: "lst_yt",
          listenUrl,
          track: "Cold Open",
        }),
      ]),
    }),
  );
  assert.match(html, /data-playback="embed"/);
  assert.match(html, /src="https:\/\/www.youtube.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(html, /data-listen-url="https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ"/);
  assert.match(html, /href="\/click\/lst_yt"/);
  assert.doesNotMatch(html, /generated\.mp3/);
  assert.doesNotMatch(html, /<audio/);
});

test("about and rules state real playback, no fake streams, no invented play counts", () => {
  const about = renderToStaticMarkup(createElement(AboutPage));
  const rules = renderToStaticMarkup(createElement(RulesPage));

  assert.match(about, /data-page="about"/);
  assert.match(about, /Rank is the bid/);
  assert.match(about, /Playback is real/);
  assert.match(about, /no fake streams/i);
  assert.match(about, /no invented play counts/i);
  assert.match(about, /playlist-headline/);
  assert.match(about, /outbid\.lol/);
  assert.match(about, /English/);
  assert.match(about, /USD/);
  assert.match(about, /global/i);

  assert.match(rules, /data-page="rules"/);
  assert.match(rules, /\$5/);
  assert.match(rules, /Older wins ties/);
  assert.match(rules, /Raise pays difference/);
  assert.match(rules, /Monday 00:00:00.000 UTC/);
  assert.match(rules, /Rolling last 7 days\. Not Monday 00:00 UTC/);
  assert.match(rules, /weekly UTC reset/i);
  assert.match(about, /rolling last 7 days/i);
  assert.match(rules, /No fake streams/);
  assert.match(rules, /No invented play counts/);
  assert.match(rules, /utm_\*/);
  assert.match(rules, /url_forbidden/);
  assert.match(rules, /GET \/click\/:id/);
  assert.match(rules, /Clicks are not plays/);

  assert.doesNotMatch(about, /1\.2M streams/);
  assert.doesNotMatch(rules, /1\.2M streams/);
});

test("paid listing listen hop stays on the stored URL", () => {
  const listingRow = applyPaidEvent({
    sessionId: "chk_play",
    weekId: currentWeekUtc().weekId,
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://open.spotify.com/track/abc123XYZ00?si=tracking",
    amountUsd: 5,
    paidAt: "2026-08-17T09:00:00.000Z",
    kind: "create",
  });
  assert.equal(listingRow.listenUrl, "https://open.spotify.com/track/abc123XYZ00");
  const playback = playbackForListing(listingRow);
  assert.equal(playback.kind, "embed");
  if (playback.kind === "embed") {
    assert.equal(playback.listenUrl, listingRow.listenUrl);
    assert.equal(
      playback.embedUrl,
      "https://open.spotify.com/embed/track/abc123XYZ00",
    );
  }
});
