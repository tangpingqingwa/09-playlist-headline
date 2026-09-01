import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AboutPage from "../src/app/about/page";
import HomePage from "../src/app/page";
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

const { Board } = HomePage;

afterEach(() => {
  resetListings();
});

const WEEK = "2026-W34";
const NEXT_RESET = "2026-08-24T00:00:00.000Z";
const readmeSource = readFileSync(join(process.cwd(), "README.md"), "utf8");
const specSource = readFileSync(join(process.cwd(), "SPEC.md"), "utf8");

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
  assert.match(about, /public auction last 7 days/);
  assert.doesNotMatch(about, /weekly public auction/i);
  assert.match(about, /Rank is the bid/);
  assert.match(about, /Playback is real/);
  assert.match(about, /no fake streams/i);
  assert.match(about, /no invented play counts/i);
  assert.match(about, /Playlist Headline is a public auction/);
  assert.match(about, /English/);
  assert.match(about, /USD/);
  assert.match(about, /participate from anywhere/);
  assert.doesNotMatch(
    about,
    /outbid\.lol|playlist-headline|\bclone\b|\bv1\b|\bfixture\b|weekId|firstPaidAt|paidAt|Waffo/i,
  );

  assert.match(rules, /data-page="rules"/);
  assert.match(rules, /\$5/);
  assert.match(rules, /First bid for a listing last 7 days must be/);
  assert.doesNotMatch(rules, /First bid for a listing this week/);
  assert.match(rules, /track placed first keeps the higher rank/);
  assert.match(rules, /same cleaned listen link may raise while its placement is active/i);
  assert.match(rules, /charged only the <strong>difference/);
  assert.match(rules, /Each placement keeps its own seven-day window/);
  assert.match(rules, /<h2>Rolling last 7 days<\/h2>/);
  assert.doesNotMatch(rules, /<h2>Weekly UTC reset<\/h2>/);
  assert.match(rules, /If last 7 days has no paid #1, there is no player and no opening song/);
  assert.doesNotMatch(rules, /If the week has no paid #1/);
  assert.match(about, /the seven-day placement window/i);
  assert.match(rules, /No fake streams/);
  assert.match(rules, /No invented play counts/);
  assert.match(rules, /Tracking, referral, and affiliate parameters are removed/);
  assert.match(rules, /unsafe destinations are rejected/);
  assert.match(rules, /Public <strong>clicks<\/strong>/);
  assert.match(rules, /Clicks are not plays/);
  assert.doesNotMatch(
    rules,
    /outbid\.lol|playlist-headline|\bclone\b|\bv1\b|\bfixture\b|weekId|firstPaidAt|paidAt|Waffo/i,
  );

  assert.doesNotMatch(about, /1\.2M streams/);
  assert.doesNotMatch(rules, /1\.2M streams/);
});

test("occupied /rules explains active-placement raises in public language", () => {
  const html = renderToStaticMarkup(createElement(RulesPage));
  assert.match(html, /same cleaned listen link may raise while its placement is active/i);
  assert.match(html, /original payer is charged only the <strong>difference/);
  assert.match(html, /Each placement keeps its own seven-day window/);
  assert.doesNotMatch(html, /weekId|firstPaidAt|paidAt|Waffo|outbid\.lol|\bclone\b|\bfixture\b/i);
});

test("rules min-bid names last-7-days — not this week", () => {
  const html = renderToStaticMarkup(createElement(RulesPage));
  assert.match(html, /data-page="rules"/);
  assert.match(html, /First bid for a listing last 7 days must be <strong>\$5<\/strong>/);
  assert.match(html, /\$5/);
  assert.doesNotMatch(html, /First bid for a listing this week/);
  assert.doesNotMatch(html, /Hear last 7 days/);
  assert.doesNotMatch(html, /Hear this week/);
  assert.match(html, /track placed first keeps the higher rank/);
  assert.match(html, /same cleaned listen link may raise while its placement is active/i);
  assert.match(html, /Each placement keeps its own seven-day window/);
});

test("about weekly names last-7-days — not this week", () => {
  const html = renderToStaticMarkup(createElement(AboutPage));
  assert.match(html, /data-page="about"/);
  assert.match(html, /public auction last 7 days/);
  assert.match(html, /Rank is the bid/);
  assert.match(html, /Playback is real/);
  assert.doesNotMatch(html, /weekly public auction/i);
  assert.doesNotMatch(html, /Weekly public auction/);
  assert.doesNotMatch(html, /Hear last 7 days/);
  assert.doesNotMatch(html, /Hear this week/);
  assert.match(html, /the seven-day placement window/i);
});

test("README weekly names last-7-days — not this week", () => {
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song/,
  );
  assert.match(readmeSource, /rolling last-7-days window/);
  assert.match(readmeSource, /Rank is the bid/);
  assert.match(readmeSource, /Playback is real/);
  assert.doesNotMatch(readmeSource, /weekly public auction/i);
  assert.doesNotMatch(readmeSource, /Weekly public auction/);
  assert.doesNotMatch(readmeSource, /Hear last 7 days/);
  assert.doesNotMatch(readmeSource, /Hear this week/);
});

test("SPEC persona names last-7-days — not this week", () => {
  assert.match(
    specSource,
    /Put a real track first last 7 days so listeners hear it first/,
  );
  assert.match(
    specSource,
    /SPEC persona copy names last 7 days, not this calendar week/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(specSource, /Put a real track first this week/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song/,
  );
  assert.doesNotMatch(readmeSource, /weekly public auction/i);
});

test("SPEC empty-playback names last-7-days — not this week", () => {
  assert.match(
    specSource,
    /If last 7 days has no paid #1, there is no player and no opening song/,
  );
  assert.match(
    specSource,
    /SPEC empty-playback copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /SPEC persona copy names last 7 days, not this calendar week/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(specSource, /If the week has no paid #1/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song/,
  );
  assert.doesNotMatch(readmeSource, /weekly public auction/i);
});

test("rules empty-playback names last-7-days — not this week", () => {
  const html = renderToStaticMarkup(createElement(RulesPage));
  assert.match(html, /data-page="rules"/);
  assert.match(
    html,
    /If last 7 days has no paid #1, there is no player and no opening song/,
  );
  assert.doesNotMatch(html, /If the week has no paid #1/);
  assert.doesNotMatch(html, /Hear last 7 days/);
  assert.doesNotMatch(html, /Hear this week/);
  assert.match(html, /First bid for a listing last 7 days must be <strong>\$5<\/strong>/);
  assert.match(html, /track placed first keeps the higher rank/);
  assert.match(html, /same cleaned listen link may raise while its placement is active/i);
  assert.match(html, /No fake streams/);
  assert.match(html, /If last 7 days has no paid #1, there is no player and no opening song/);
  assert.match(
    specSource,
    /If last 7 days has no paid #1, there is no player and no opening song/,
  );
  assert.match(
    specSource,
    /SPEC empty-playback copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules empty-playback copy names last 7 days, not this calendar week/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(specSource, /If the week has no paid #1/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song/,
  );
  assert.doesNotMatch(readmeSource, /weekly public auction/i);
});

test("rules empty-week names last-7-days — not this week", () => {
  const html = renderToStaticMarkup(createElement(RulesPage));
  assert.match(html, /data-page="rules"/);
  assert.match(html, /If nobody has paid for an active placement, there is no opening song/);
  assert.doesNotMatch(html, /An empty week is valid/);
  assert.doesNotMatch(html, /Hear last 7 days/);
  assert.doesNotMatch(html, /Hear this week/);
  assert.match(
    html,
    /If last 7 days has no paid #1, there is no player and no opening song/,
  );
  assert.doesNotMatch(html, /If the week has no paid #1/);
  assert.match(html, /First bid for a listing last 7 days must be <strong>\$5<\/strong>/);
  assert.match(html, /track placed first keeps the higher rank/);
  assert.match(html, /same cleaned listen link may raise while its placement is active/i);
  assert.match(html, /No fake streams/);
  assert.match(html, /If last 7 days has no paid #1, there is no player and no opening song/);
  assert.match(
    specSource,
    /Rules empty-week copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules empty-playback copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /If last 7 days has no paid #1, there is no player and no opening song/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(specSource, /If the week has no paid #1/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song/,
  );
  assert.doesNotMatch(readmeSource, /weekly public auction/i);
});

test("rules weekly-reset heading names last-7-days — not this week", () => {
  const html = renderToStaticMarkup(createElement(RulesPage));
  assert.match(html, /data-page="rules"/);
  assert.match(html, /<h2>Rolling last 7 days<\/h2>/);
  assert.doesNotMatch(html, /<h2>Weekly UTC reset<\/h2>/);
  assert.doesNotMatch(html, /Hear last 7 days/);
  assert.doesNotMatch(html, /Hear this week/);
  assert.match(html, /If nobody has paid for an active placement, there is no opening song/);
  assert.doesNotMatch(html, /An empty week is valid/);
  assert.match(
    html,
    /If last 7 days has no paid #1, there is no player and no opening song/,
  );
  assert.doesNotMatch(html, /If the week has no paid #1/);
  assert.match(html, /First bid for a listing last 7 days must be <strong>\$5<\/strong>/);
  assert.match(html, /track placed first keeps the higher rank/);
  assert.match(html, /same cleaned listen link may raise while its placement is active/i);
  assert.match(html, /No fake streams/);
  assert.match(html, /If last 7 days has no paid #1, there is no player and no opening song/);
  assert.match(html, /Each placement keeps its own seven-day window/);
  assert.match(
    specSource,
    /Rules weekly-reset heading names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules empty-week copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules empty-playback copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /If last 7 days has no paid #1, there is no player and no opening song/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(specSource, /If the week has no paid #1/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song/,
  );
  assert.doesNotMatch(readmeSource, /weekly public auction/i);
});

test("about weekly-reset CTA names last-7-days — not this week", () => {
  const html = renderToStaticMarkup(createElement(AboutPage));
  assert.match(html, /data-page="about"/);
  assert.match(html, /href="\/rules">Read the rules/);
  assert.match(html, /the seven-day placement window/);
  assert.doesNotMatch(html, /weekly reset/i);
  assert.doesNotMatch(html, /Hear last 7 days/);
  assert.doesNotMatch(html, /Hear this week/);
  assert.match(html, /public auction last 7 days/);
  assert.match(html, /Rank is the bid/);
  assert.match(html, /Playback is real/);
  assert.match(html, /\$5 minimum/);
  assert.match(html, /older-wins ties/);
  assert.match(html, /raise-pays-difference/);
  assert.match(
    specSource,
    /About weekly-reset CTA names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules weekly-reset heading names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules empty-week copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules empty-playback copy names last 7 days, not this calendar week/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song/,
  );
  assert.doesNotMatch(readmeSource, /weekly public auction/i);
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
