import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AboutPage from "../src/app/about/page";
import { Board, ListingCard } from "../src/app/page";
import RulesPage from "../src/app/rules/page";
import { rankListings, type Listing } from "../src/core/rank";

const WEEK = "2026-W34";
const NEXT_RESET = "2026-08-24T00:00:00.000Z";
const root = process.cwd();
const pageSource = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");
const cssSource = readFileSync(join(root, "src", "app", "board.css"), "utf8");
const formSource = readFileSync(join(root, "src", "app", "outbid-form.tsx"), "utf8");
const layoutSource = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");
const rulesSource = readFileSync(
  join(root, "src", "app", "rules", "page.tsx"),
  "utf8",
);
const aboutSource = readFileSync(
  join(root, "src", "app", "about", "page.tsx"),
  "utf8",
);
const specSource = readFileSync(join(root, "SPEC.md"), "utf8");
const readmeSource = readFileSync(join(root, "README.md"), "utf8");

const FORBIDDEN =
  /play count|stream count|monthly listeners|1\.2M streams|fake stream|<audio|waveform/i;

function listing(
  partial: Partial<Listing> & Pick<Listing, "id" | "listenUrl">,
): Listing {
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

function renderBoard(listings: Listing[]): string {
  return renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: rankListings(listings),
    }),
  );
}

test("station desk is a unique opening-song surface, not a centered form theme", () => {
  const empty = renderBoard([]);

  assert.match(empty, /class="board station week-empty"/);
  assert.match(empty, /station-desk/);
  assert.match(empty, /studio-deck/);
  assert.match(empty, /claim-rail/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /Outbid/);
  assert.match(layoutSource, /Leaderboard/);
  assert.match(layoutSource, /href="\/about"/);
  assert.match(layoutSource, /href="\/rules"/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /className="amount-field"/);
  assert.match(formSource, /−/);
  assert.match(formSource, /\+/);
  assert.match(formSource, /Outbid/);
  assert.match(cssSource, /text-decoration: underline dashed/);
  assert.match(cssSource, /grid-template-columns: minmax\(0, 1\.45fr\)/);
  assert.doesNotMatch(cssSource, /nightclub|#12081a|#f472b6/i);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.doesNotMatch(pageSource, FORBIDDEN);
});

test("empty week has no player and no invented opening song", () => {
  const html = renderBoard([]);
  assert.match(html, /data-empty-week="true"/);
  assert.match(html, /data-opening-song="false"/);
  assert.match(html, /No opening song/);
  assert.match(html, /Nobody has paid yet/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /<audio/);
  assert.doesNotMatch(html, /data-playback=/);
  assert.doesNotMatch(html, /data-listen-url/);
  assert.doesNotMatch(html, /data-listing-card/);
  assert.doesNotMatch(html, /data-leaderboard/);
  assert.doesNotMatch(html, FORBIDDEN);
});

test("empty week does not claim the studio stays dark on a lit cream card", () => {
  const html = renderBoard([]);
  assert.match(html, /data-empty-week="true"/);
  assert.match(html, /data-opening-song="false"/);
  assert.match(html, /No opening song/);
  assert.match(html, /Nobody has paid yet/);
  assert.match(html, /There is no player last 7 days/);
  assert.doesNotMatch(html, /stays dark/i);
  assert.doesNotMatch(pageSource, /stays dark/i);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /<audio/);
  assert.doesNotMatch(html, /data-playback=/);
  assert.doesNotMatch(html, FORBIDDEN);
});

test("player exists only for paid #1 and only for the stored listen URL", () => {
  const youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const html = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: youtube,
      bidUsd: 12,
      clicks: 4,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);

  assert.match(html, /data-opening-song="true"/);
  assert.match(html, /data-playback="embed"/);
  assert.match(html, /src="https:\/\/www.youtube.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(html, /data-listen-url="https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ"/);
  assert.match(html, /href="\/click\/lst_open"/);
  assert.match(html, /On air/);
  assert.match(html, /\$12/);
  assert.match(html, /4 clicks/);
  assert.match(html, /data-hear-opening="embed"/);
  assert.match(html, /Open on youtube.com/);
  assert.match(html, /Hear last 7 days/);
  assert.match(html, /data-first-click="hear"/);
  assert.equal((html.match(/data-playback="embed"/g) ?? []).length, 1);
  assert.equal((html.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((html.match(/<iframe/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-empty-week/);
  assert.doesNotMatch(html, /generated\.mp3/);
  assert.doesNotMatch(html, /<audio/);
  assert.doesNotMatch(html, FORBIDDEN);
});

test("opening song lives once on the studio deck, not again as the first queue card", () => {
  const html = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);

  assert.match(html, /data-opening-song="true"/);
  assert.match(html, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(html, /data-id="lst_open"/);
  assert.match(html, /data-id="lst_two"/);
  assert.match(html, /Also last 7 days/);
  assert.match(html, /These tracks are not the opening song/);
  assert.equal((html.match(/data-id="lst_open"/g) ?? []).length, 1);
  assert.equal((html.match(/Cold Open/g) ?? []).length, 1);
  assert.doesNotMatch(html, /This week&apos;s board/);
  assert.doesNotMatch(html, /<h3 class="track">Cold Open<\/h3>/);
  assert.match(html, /<p class="later-track" data-later-track="">Second Slot<\/p>/);
  assert.doesNotMatch(html, /<h3 class="track">Second Slot<\/h3>/);
  assert.doesNotMatch(html, FORBIDDEN);
});

test("solo #1 has no queue; empty week still has no cards", () => {
  const solo = renderBoard([
    listing({
      id: "lst_only",
      track: "Only Open",
      listenUrl: "https://example.com/only-open",
    }),
  ]);
  assert.match(solo, /data-opening-song="true"/);
  assert.match(solo, /<h1 class="opening-track" data-prize="">Only Open<\/h1>/);
  assert.match(solo, /data-id="lst_only"/);
  assert.doesNotMatch(solo, /data-leaderboard/);
  assert.doesNotMatch(solo, /<h3 class="track">Only Open<\/h3>/);
  assert.doesNotMatch(solo, FORBIDDEN);

  const empty = renderBoard([]);
  assert.match(empty, /data-empty-week="true"/);
  assert.doesNotMatch(empty, /data-listing-card/);
  assert.doesNotMatch(empty, /data-leaderboard/);
});

test("generic listen URL has no embed player and cards stay track — artist — listen", () => {
  const listenUrl = "https://example.com/cold-open";
  const html = renderBoard([
    listing({
      id: "lst_generic",
      track: "Cold Open",
      artist: "Ada",
      listenUrl,
      clicks: 1,
    }),
  ]);

  assert.match(html, /data-opening-song="true"/);
  assert.match(html, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(html, /<p class="opening-artist">Ada<\/p>/);
  assert.match(html, /href="\/click\/lst_generic"/);
  assert.match(html, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(html, /1 click</);
  assert.doesNotMatch(html, /data-leaderboard/);
  assert.doesNotMatch(html, /<h3 class="track">Cold Open<\/h3>/);
  assert.match(html, /Hear last 7 days/);
  assert.match(html, /data-hear-opening="hop"/);
  assert.doesNotMatch(html, /Official embed is not available/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /data-playback=/);
  assert.doesNotMatch(html, /\bplays\b/i);
  assert.doesNotMatch(html, FORBIDDEN);
});

test("paid #1 has one certain way to hear the opening song", () => {
  const embed = renderBoard([
    listing({
      id: "lst_open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    }),
  ]);
  assert.match(embed, /data-hear-opening="embed"/);
  assert.match(embed, /data-playback="embed"/);
  assert.match(embed, /src="https:\/\/www.youtube.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(embed, /href="\/click\/lst_open"/);
  assert.match(embed, /Open on youtube.com/);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((embed.match(/<iframe/g) ?? []).length, 1);
  assert.match(embed, /Hear last 7 days/);
  assert.match(embed, /data-first-click="hear"/);
  assert.match(embed, /href="#hear-opening"/);
  assert.doesNotMatch(embed, /Official embed is not available/);
  assert.doesNotMatch(embed, FORBIDDEN);

  const hop = renderBoard([
    listing({
      id: "lst_hop",
      listenUrl: "https://example.com/cold-open",
    }),
  ]);
  assert.match(hop, /data-hear-opening="hop"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /href="\/click\/lst_hop"/);
  assert.match(hop, /data-first-click="hear"/);
  assert.match(hop, /example.com/);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.doesNotMatch(hop, /<iframe/);
  assert.doesNotMatch(hop, /data-playback=/);
  assert.doesNotMatch(hop, /Official embed is not available/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const empty = renderBoard([]);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /<iframe/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("first-time artist claiming the opening song is certain on the claim rail", () => {
  const empty = renderBoard([]);
  assert.match(empty, /data-claim-opening="empty"/);
  assert.match(empty, /data-claim-note="empty"/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /A completed payment takes #1/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /No opening song/);
  assert.match(empty, /Nobody has paid yet/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /pays only the difference/);
  assert.doesNotMatch(empty, /New spots start/);
  assert.doesNotMatch(empty, /Already on this week/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  assert.match(occupied, /data-claim-opening="take"/);
  assert.match(occupied, /data-claim-note="take"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /A new listing pays that full amount/);
  assert.match(occupied, /Same listen URL pays only the difference/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, />Outbid</);
  assert.match(occupied, /data-hear-opening="hop"/);
  assert.match(occupied, /\$12/);
  assert.doesNotMatch(occupied, /data-claim-opening="empty"/);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /New spots start/);
  assert.doesNotMatch(occupied, /Already on this week/);
  assert.doesNotMatch(occupied, FORBIDDEN);

  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /className="amount-field"/);
  assert.match(formSource, /−/);
  assert.match(formSource, /\+/);
  assert.match(formSource, /Outbid/);
  assert.match(pageSource, /station-desk/);
  assert.match(pageSource, /claim-rail/);
  assert.match(pageSource, /data-hear-opening/);
});

test("occupied listen is the first read, not Claim #1 / raise copy", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const hearFirst = hop.indexOf('data-hear-first="true"');
  const hearCopy = hop.indexOf("opening song is on");
  const firstClick = hop.indexOf('data-first-click="hear"');
  const openingTrack = hop.indexOf(
    '<h1 class="opening-track" data-prize="">Cold Open</h1>',
  );
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const claim = hop.indexOf('id="claim"');
  const bidUsd = hop.indexOf("Bid USD");
  assert.notEqual(firstRead, -1);
  assert.notEqual(hearFirst, -1);
  assert.notEqual(hearCopy, -1);
  assert.notEqual(openingTrack, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < claim);
  assert.ok(hearFirst < claim);
  assert.ok(hearCopy < firstClick);
  assert.ok(firstClick < claim);
  assert.ok(hearHop < claim);
  assert.equal(bidUsd, -1);
  assert.match(hop, /data-first-read="hear"/);
  assert.match(hop, /data-hear-first="true"/);
  assert.match(hop, /data-opening-song="true"[^>]*data-hear-first="true"/);
  assert.match(hop, /opening song is on/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedRead = embed.indexOf('data-first-read="hear"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedRead, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedClaim, -1);
  assert.ok(embedRead < embedHear);
  assert.ok(embedHear < embedClaim);
  assert.match(embed, /data-hear-first="true"/);
  assert.doesNotMatch(embed, /Bid USD/);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.doesNotMatch(embed, FORBIDDEN);

  const emptyOpening = empty.indexOf("No opening song");
  const emptyClaim = empty.indexOf('id="claim"');
  assert.notEqual(emptyOpening, -1);
  assert.notEqual(emptyClaim, -1);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /data-hear-first="false"/);
  assert.doesNotMatch(empty, /data-hear-first="true"/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /No opening song/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("first-time artist raising after listen-first is certain above the fold", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const hearCopy = hop.indexOf("opening song is on");
  const firstClick = hop.indexOf('data-first-click="hear"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const claim = hop.indexOf('id="claim"');
  const hearControl = hop.indexOf('data-hear-opening="hop"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(hearCopy, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(claim, -1);
  assert.notEqual(hearControl, -1);
  assert.ok(firstRead < firstClick);
  assert.ok(hearCopy < firstClick);
  assert.ok(firstClick < raiseHop);
  assert.ok(raiseHop < claim);
  assert.ok(hearControl < raiseHop);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /data-first-read="hear"/);
  assert.match(hop, /data-first-click="hear"/);
  assert.match(hop, /data-hear-after-raise="true"/);
  assert.match(hop, /data-hear-first="true"/);
  assert.match(hop, /data-hear-opening="hop"/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedRaise = embed.indexOf('data-raise-after-hear="true"');
  const embedFirstClick = embed.indexOf('data-first-click="hear"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedRaise, -1);
  assert.notEqual(embedFirstClick, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedClaim, -1);
  assert.ok(embed.indexOf('data-first-read="hear"') < embedFirstClick);
  assert.ok(embedFirstClick < embedHear);
  assert.ok(embedHear < embedRaise);
  assert.ok(embedRaise < embedClaim);
  assert.equal((embed.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Hear last 7 days/);
  assert.match(embed, /href="#hear-opening"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-raise-after-hear/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /data-hear-after-raise/);
  assert.doesNotMatch(empty, /href="#claim"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear is the first click after the Need $N hop", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const hearCopy = hop.indexOf("opening song is on");
  const hearFirstClick = hop.indexOf('data-first-click="hear"');
  const hearAfterRaise = hop.indexOf('data-hear-after-raise="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(hearCopy, -1);
  assert.notEqual(hearFirstClick, -1);
  assert.notEqual(hearAfterRaise, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterRaise);
  assert.ok(hearCopy < hearAfterRaise);
  assert.ok(hearAfterRaise < raiseHop);
  assert.ok(hearHop < raiseHop);
  assert.ok(hearFirstClick < raiseHop);
  assert.ok(raiseHop < claim);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /data-first-read="hear"/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedHearAfter = embed.indexOf('data-hear-after-raise="true"');
  const embedFirstClick = embed.indexOf('data-first-click="hear"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedRaise = embed.indexOf('data-raise-after-hear="true"');
  assert.notEqual(embedHearAfter, -1);
  assert.notEqual(embedFirstClick, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedRaise, -1);
  assert.ok(embed.indexOf('data-first-read="hear"') < embedHearAfter);
  assert.ok(embedHearAfter < embedRaise);
  assert.ok(embedFirstClick < embedRaise);
  assert.match(embed, /href="#hear-opening"/);
  assert.match(embed, /id="hear-opening"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-raise/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /href="#hear-opening"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied raise after Hear-first is certain above the fold", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const raiseFirst = hop.indexOf('data-raise-after-hear-first="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(raiseFirst, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < firstClick);
  assert.ok(firstClick < raiseFirst);
  assert.ok(hearHop < raiseFirst);
  assert.ok(raiseFirst < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(raiseNote < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-raise-after-hear-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-note="difference"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /data-first-click="hear"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.match(cssSource, /\.need-after-hear \{[\s\S]*border: 2px dashed/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedRaiseFirst = embed.indexOf('data-raise-after-hear-first="true"');
  const embedHear = embed.indexOf('data-first-click="hear"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedRaiseFirst, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embedHear < embedRaiseFirst);
  assert.ok(embedRaiseFirst < embedNote);
  assert.ok(embedNote < embedClaim);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.match(embed, /href="#hear-opening"/);
  assert.equal((embed.match(/data-raise-after-hear-first="true"/g) ?? []).length, 1);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-raise-after-hear-first/);
  assert.doesNotMatch(empty, /data-raise-note/);
  assert.doesNotMatch(empty, /data-raise-after-hear/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /pays only the difference/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear after the named raise difference is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const raiseFirst = hop.indexOf('data-raise-after-hear-first="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(raiseFirst, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < firstClick);
  assert.ok(firstClick < raiseFirst);
  assert.ok(hearHop < raiseFirst);
  assert.ok(raiseFirst < raiseNote);
  assert.ok(raiseNote < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-raise-note="difference"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedRaiseNote = embed.indexOf('data-raise-note="difference"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedRaiseNote, -1);
  assert.notEqual(embedHear, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHear);
  assert.ok(embedHear < embedRaiseNote);
  assert.ok(embedRaiseNote < embedClaim);
  assert.match(embed, /href="#hear-opening"/);
  assert.match(embed, /id="hear-opening"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-difference/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /data-raise-after-hear-first/);
  assert.doesNotMatch(empty, /data-raise-note/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /pays only the difference/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear is one first Hear, not a second hop after the difference", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearOne);
  assert.ok(firstClick < hearOne);
  assert.ok(hearOne < raiseNote);
  assert.ok(hearHop < raiseNote);
  assert.ok(hearOne < needCopy);
  assert.ok(needCopy < claim);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(hop, /data-hear-one-first="true"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedOne = embed.indexOf('data-hear-one-first="true"');
  const embedRaise = embed.indexOf('data-raise-note="difference"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedOne, -1);
  assert.notEqual(embedRaise, -1);
  assert.notEqual(embedHear, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedOne);
  assert.ok(embedOne < embedHear);
  assert.ok(embedHear < embedRaise);
  assert.ok(embedRaise < embedClaim);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /id="hear-opening"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied Need $N after one Hear is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearOne);
  assert.ok(firstClick < hearOne);
  assert.ok(hearOne < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(needAfter < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/Need \$13 to take #1/g) ?? []).length, 2);
  assert.match(hop, /data-need-after-hear="true"/);
  assert.match(hop, /class="need-after-hear(?: need-after-hear-two(?: need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /data-hear-one-first="true"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const hearRule = cssSource.match(/\.week-occupied \.opening-listen \{[^}]+\}/);
  assert.ok(needRule);
  assert.ok(hearRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(hearRule[0], /min-height: 2\.4rem/);
  assert.match(hearRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedOne = embed.indexOf('data-hear-one-first="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedOne, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedOne);
  assert.ok(embedOne < embedNeed);
  assert.ok(embedNeed < embedNote);
  assert.ok(embedHear < embedNeed);
  assert.ok(embedNeed < embedClaim);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear after Need $N is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearOne < hearAfterNeed || hearAfterNeed === hearOne);
  assert.ok(hearAfterNeed < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(needAfter < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-hear-after-need="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need(?: hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?)?"/);
  assert.match(hop, /data-need-after-hear="true"/);
  assert.match(hop, /class="need-after-hear(?: need-after-hear-two(?: need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /data-hear-one-first="true"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const hearRule = cssSource.match(/\.week-occupied \.opening-listen \{[^}]+\}/);
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  assert.ok(needRule);
  assert.ok(hearRule);
  assert.ok(hearAfterNeedRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(hearRule[0], /min-height: 2\.4rem/);
  assert.match(hearRule[0], /background: var\(--ink\)/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.ok(
    hearAfterNeedRule[0].includes("2.75rem") &&
      needRule[0].includes("2.15rem"),
    "Hear after Need $N must be taller than the dashed raise control",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedOne = embed.indexOf('data-hear-one-first="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedOne, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedNeed);
  assert.ok(embedNeed < embedNote);
  assert.ok(embedHear < embedNeed);
  assert.ok(embedNeed < embedClaim);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="listen opening-listen hear-after-need(?: hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied Need $N after Hear is re-concentrated is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(Math.abs(needAfterTwo - needAfter) < 120);
  assert.ok(needAfterTwo < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(needAfterTwo < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-need-after-hear-two="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two(?: need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?)?"/);
  assert.match(hop, /data-need-after-hear="true"/);
  assert.match(hop, /data-hear-after-need="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need(?: hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(hearAfterNeedRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.ok(
    hearAfterNeedRule[0].includes("2.75rem") &&
      needTwoRule[0].includes("2.45rem"),
    "Need $N after Hear is re-concentrated must stay shorter than Hear",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNote);
  assert.ok(embedHear < embedNeedTwo);
  assert.ok(embedNeedTwo < embedClaim);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="need-after-hear need-after-hear-two(?: need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?)?"/);
  assert.match(embed, /class="listen opening-listen hear-after-need(?: hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear after Need $N is re-concentrated is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearAfterNeedTwo = hop.indexOf('data-hear-after-need-two="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearAfterNeedTwo, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < hearAfterNeedTwo || hearAfterNeedTwo === hearAfterNeed);
  assert.ok(Math.abs(hearAfterNeedTwo - hearAfterNeed) < 160);
  assert.ok(hearAfterNeedTwo < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(needAfterTwo < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(hearAfterNeedTwo < claim);
  assert.ok(needAfterTwo < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-hear-after-need-two="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?"/);
  assert.match(hop, /data-hear-after-need="true"/);
  assert.match(hop, /data-need-after-hear-two="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two(?: need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(hearAfterNeedRule);
  assert.ok(hearAfterNeedTwoRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(hearAfterNeedTwoRule[0], /min-height: 3\.05rem/);
  assert.match(hearAfterNeedTwoRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /border:/);
  assert.ok(
    hearAfterNeedTwoRule[0].includes("3.05rem") &&
      needTwoRule[0].includes("2.45rem"),
    "Hear after Need $N is re-concentrated must stay taller than Need $N",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedHearAfterNeedTwo = embed.indexOf('data-hear-after-need-two="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedHearAfterNeedTwo, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedHearAfterNeedTwo || embedHearAfterNeedTwo === embedHearAfterNeed);
  assert.ok(embedHearAfterNeedTwo < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNote);
  assert.ok(embedHear < embedNeedTwo);
  assert.ok(embedNeedTwo < embedClaim);
  assert.equal((embed.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="listen opening-listen hear-after-need hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?"/);
  assert.match(embed, /class="need-after-hear need-after-hear-two(?: need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-need-two/);
  assert.doesNotMatch(empty, /hear-after-need-two/);
  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied Need $N after Hear is re-concentrated again is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearAfterNeedTwo = hop.indexOf('data-hear-after-need-two="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const needAfterThree = hop.indexOf('data-need-after-hear-three="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearAfterNeedTwo, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(needAfterThree, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < hearAfterNeedTwo || hearAfterNeedTwo === hearAfterNeed);
  assert.ok(hearAfterNeedTwo < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(needAfterTwo < needAfterThree || needAfterThree === needAfterTwo);
  assert.ok(Math.abs(needAfterThree - needAfter) < 180);
  assert.ok(needAfterThree < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(needAfterThree < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-need-after-hear-three="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?"/);
  assert.match(hop, /data-need-after-hear-two="true"/);
  assert.match(hop, /data-need-after-hear="true"/);
  assert.match(hop, /data-hear-after-need-two="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(needThreeRule);
  assert.ok(hearAfterNeedRule);
  assert.ok(hearAfterNeedTwoRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(needThreeRule[0], /min-height: 2\.75rem/);
  assert.match(needThreeRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(needThreeRule[0], /background:/);
  assert.doesNotMatch(needThreeRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(hearAfterNeedTwoRule[0], /min-height: 3\.05rem/);
  assert.match(hearAfterNeedTwoRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /border:/);
  assert.ok(
    hearAfterNeedTwoRule[0].includes("3.05rem") &&
      needThreeRule[0].includes("2.75rem"),
    "Need $N after Hear is re-concentrated again must stay shorter than Hear",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needThreeRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedNeedThree = embed.indexOf('data-need-after-hear-three="true"');
  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHearAfterNeedTwo = embed.indexOf('data-hear-after-need-two="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedNeedThree, -1);
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHearAfterNeedTwo, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedHearAfterNeedTwo || embedHearAfterNeedTwo === embedHearAfterNeed);
  assert.ok(embedHearAfterNeedTwo < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNeedThree || embedNeedThree === embedNeedTwo);
  assert.ok(embedNeedThree < embedNote);
  assert.ok(embedHear < embedNeedThree);
  assert.ok(embedNeedThree < embedClaim);
  assert.equal((embed.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="need-after-hear need-after-hear-two need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?"/);
  assert.match(embed, /class="listen opening-listen hear-after-need hear-after-need-two(?: hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-need-after-hear-three/);
  assert.doesNotMatch(empty, /need-after-hear-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear after Need $N is re-concentrated again is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearAfterNeedTwo = hop.indexOf('data-hear-after-need-two="true"');
  const hearAfterNeedThree = hop.indexOf('data-hear-after-need-three="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const needAfterThree = hop.indexOf('data-need-after-hear-three="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearAfterNeedTwo, -1);
  assert.notEqual(hearAfterNeedThree, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(needAfterThree, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < hearAfterNeedTwo || hearAfterNeedTwo === hearAfterNeed);
  assert.ok(hearAfterNeedTwo < hearAfterNeedThree || hearAfterNeedThree === hearAfterNeedTwo);
  assert.ok(Math.abs(hearAfterNeedThree - hearAfterNeed) < 200);
  assert.ok(hearAfterNeedThree < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(needAfterTwo < needAfterThree || needAfterThree === needAfterTwo);
  assert.ok(needAfterThree < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(hearAfterNeedThree < claim);
  assert.ok(needAfterThree < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-hear-after-need-three="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?"/);
  assert.match(hop, /data-hear-after-need-two="true"/);
  assert.match(hop, /data-hear-after-need="true"/);
  assert.match(hop, /data-need-after-hear-three="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(needThreeRule);
  assert.ok(hearAfterNeedRule);
  assert.ok(hearAfterNeedTwoRule);
  assert.ok(hearAfterNeedThreeRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(needThreeRule[0], /min-height: 2\.75rem/);
  assert.match(needThreeRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(needThreeRule[0], /background:/);
  assert.doesNotMatch(needThreeRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(hearAfterNeedTwoRule[0], /min-height: 3\.05rem/);
  assert.match(hearAfterNeedTwoRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /border:/);
  assert.match(hearAfterNeedThreeRule[0], /min-height: 3\.35rem/);
  assert.match(hearAfterNeedThreeRule[0], /font-size: 1\.22rem/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /border:/);
  assert.ok(
    hearAfterNeedThreeRule[0].includes("3.35rem") &&
      needThreeRule[0].includes("2.75rem"),
    "Hear after Need $N is re-concentrated again must stay taller than Need $N",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needThreeRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedHearAfterNeedThree = embed.indexOf('data-hear-after-need-three="true"');
  const embedHearAfterNeedTwo = embed.indexOf('data-hear-after-need-two="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedNeedThree = embed.indexOf('data-need-after-hear-three="true"');
  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedHearAfterNeedThree, -1);
  assert.notEqual(embedHearAfterNeedTwo, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedNeedThree, -1);
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedHearAfterNeedTwo || embedHearAfterNeedTwo === embedHearAfterNeed);
  assert.ok(embedHearAfterNeedTwo < embedHearAfterNeedThree || embedHearAfterNeedThree === embedHearAfterNeedTwo);
  assert.ok(embedHearAfterNeedThree < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNeedThree || embedNeedThree === embedNeedTwo);
  assert.ok(embedNeedThree < embedNote);
  assert.ok(embedHear < embedNeedThree);
  assert.ok(embedNeedThree < embedClaim);
  assert.equal((embed.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?"/);
  assert.match(embed, /class="need-after-hear need-after-hear-two need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-need-three/);
  assert.doesNotMatch(empty, /hear-after-need-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-three/);
  assert.doesNotMatch(empty, /need-after-hear-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied Need $N after Hear is re-concentrated again after a louder Hear is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearAfterNeedTwo = hop.indexOf('data-hear-after-need-two="true"');
  const hearAfterNeedThree = hop.indexOf('data-hear-after-need-three="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const needAfterThree = hop.indexOf('data-need-after-hear-three="true"');
  const needAfterFour = hop.indexOf('data-need-after-hear-four="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearAfterNeedTwo, -1);
  assert.notEqual(hearAfterNeedThree, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(needAfterThree, -1);
  assert.notEqual(needAfterFour, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < hearAfterNeedTwo || hearAfterNeedTwo === hearAfterNeed);
  assert.ok(hearAfterNeedTwo < hearAfterNeedThree || hearAfterNeedThree === hearAfterNeedTwo);
  assert.ok(hearAfterNeedThree < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(needAfterTwo < needAfterThree || needAfterThree === needAfterTwo);
  assert.ok(needAfterThree < needAfterFour || needAfterFour === needAfterThree);
  assert.ok(Math.abs(needAfterFour - needAfter) < 220);
  assert.ok(needAfterFour < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(needAfterFour < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-need-after-hear-four="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four(?: need-after-hear-five)?"/);
  assert.match(hop, /data-need-after-hear-three="true"/);
  assert.match(hop, /data-need-after-hear-two="true"/);
  assert.match(hop, /data-need-after-hear="true"/);
  assert.match(hop, /data-hear-after-need-three="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(needThreeRule);
  assert.ok(needFourRule);
  assert.ok(hearAfterNeedRule);
  assert.ok(hearAfterNeedTwoRule);
  assert.ok(hearAfterNeedThreeRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(needThreeRule[0], /min-height: 2\.75rem/);
  assert.match(needThreeRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(needThreeRule[0], /background:/);
  assert.doesNotMatch(needThreeRule[0], /border:/);
  assert.match(needFourRule[0], /min-height: 3\.05rem/);
  assert.match(needFourRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(needFourRule[0], /background:/);
  assert.doesNotMatch(needFourRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(hearAfterNeedTwoRule[0], /min-height: 3\.05rem/);
  assert.match(hearAfterNeedTwoRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /border:/);
  assert.match(hearAfterNeedThreeRule[0], /min-height: 3\.35rem/);
  assert.match(hearAfterNeedThreeRule[0], /font-size: 1\.22rem/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /border:/);
  assert.ok(
    hearAfterNeedThreeRule[0].includes("3.35rem") &&
      needFourRule[0].includes("3.05rem"),
    "Need $N after Hear is re-concentrated again must stay shorter than the louder Hear",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needThreeRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needFourRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedNeedFour = embed.indexOf('data-need-after-hear-four="true"');
  const embedNeedThree = embed.indexOf('data-need-after-hear-three="true"');
  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHearAfterNeedThree = embed.indexOf('data-hear-after-need-three="true"');
  const embedHearAfterNeedTwo = embed.indexOf('data-hear-after-need-two="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedNeedFour, -1);
  assert.notEqual(embedNeedThree, -1);
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHearAfterNeedThree, -1);
  assert.notEqual(embedHearAfterNeedTwo, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedHearAfterNeedTwo || embedHearAfterNeedTwo === embedHearAfterNeed);
  assert.ok(embedHearAfterNeedTwo < embedHearAfterNeedThree || embedHearAfterNeedThree === embedHearAfterNeedTwo);
  assert.ok(embedHearAfterNeedThree < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNeedThree || embedNeedThree === embedNeedTwo);
  assert.ok(embedNeedThree < embedNeedFour || embedNeedFour === embedNeedThree);
  assert.ok(embedNeedFour < embedNote);
  assert.ok(embedHear < embedNeedFour);
  assert.ok(embedNeedFour < embedClaim);
  assert.equal((embed.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four(?: need-after-hear-five)?"/);
  assert.match(embed, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three(?: hear-after-need-four(?: hear-after-need-five)?)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-need-after-hear-four/);
  assert.doesNotMatch(empty, /need-after-hear-four/);
  assert.doesNotMatch(empty, /data-need-after-hear-three/);
  assert.doesNotMatch(empty, /need-after-hear-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear after Need $N is re-concentrated again after a louder Need is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearAfterNeedTwo = hop.indexOf('data-hear-after-need-two="true"');
  const hearAfterNeedThree = hop.indexOf('data-hear-after-need-three="true"');
  const hearAfterNeedFour = hop.indexOf('data-hear-after-need-four="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const needAfterThree = hop.indexOf('data-need-after-hear-three="true"');
  const needAfterFour = hop.indexOf('data-need-after-hear-four="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearAfterNeedTwo, -1);
  assert.notEqual(hearAfterNeedThree, -1);
  assert.notEqual(hearAfterNeedFour, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(needAfterThree, -1);
  assert.notEqual(needAfterFour, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < hearAfterNeedTwo || hearAfterNeedTwo === hearAfterNeed);
  assert.ok(hearAfterNeedTwo < hearAfterNeedThree || hearAfterNeedThree === hearAfterNeedTwo);
  assert.ok(hearAfterNeedThree < hearAfterNeedFour || hearAfterNeedFour === hearAfterNeedThree);
  assert.ok(Math.abs(hearAfterNeedFour - hearAfterNeed) < 240);
  assert.ok(hearAfterNeedFour < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(needAfterTwo < needAfterThree || needAfterThree === needAfterTwo);
  assert.ok(needAfterThree < needAfterFour || needAfterFour === needAfterThree);
  assert.ok(needAfterFour < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(hearAfterNeedFour < claim);
  assert.ok(needAfterFour < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-hear-after-need-four="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-hear-after-need-four="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four(?: hear-after-need-five)?"/);
  assert.match(hop, /data-hear-after-need-three="true"/);
  assert.match(hop, /data-hear-after-need-two="true"/);
  assert.match(hop, /data-hear-after-need="true"/);
  assert.match(hop, /data-need-after-hear-four="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four(?: need-after-hear-five)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFourRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{\n  min-height: 3\.65rem;[\s\S]*?\n\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(needThreeRule);
  assert.ok(needFourRule);
  assert.ok(hearAfterNeedRule);
  assert.ok(hearAfterNeedTwoRule);
  assert.ok(hearAfterNeedThreeRule);
  assert.ok(hearAfterNeedFourRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(needThreeRule[0], /min-height: 2\.75rem/);
  assert.match(needThreeRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(needThreeRule[0], /background:/);
  assert.doesNotMatch(needThreeRule[0], /border:/);
  assert.match(needFourRule[0], /min-height: 3\.05rem/);
  assert.match(needFourRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(needFourRule[0], /background:/);
  assert.doesNotMatch(needFourRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(hearAfterNeedTwoRule[0], /min-height: 3\.05rem/);
  assert.match(hearAfterNeedTwoRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /border:/);
  assert.match(hearAfterNeedThreeRule[0], /min-height: 3\.35rem/);
  assert.match(hearAfterNeedThreeRule[0], /font-size: 1\.22rem/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /border:/);
  assert.match(hearAfterNeedFourRule[0], /min-height: 3\.65rem/);
  assert.match(hearAfterNeedFourRule[0], /font-size: 1\.32rem/);
  assert.doesNotMatch(hearAfterNeedFourRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedFourRule[0], /border:/);
  assert.ok(
    hearAfterNeedFourRule[0].includes("3.65rem") &&
      needFourRule[0].includes("3.05rem"),
    "Hear after Need $N is re-concentrated again after a louder Need must stay taller than Need $N",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needThreeRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needFourRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /data-need-after-hear-six/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedHearAfterNeedFour = embed.indexOf('data-hear-after-need-four="true"');
  const embedHearAfterNeedThree = embed.indexOf('data-hear-after-need-three="true"');
  const embedHearAfterNeedTwo = embed.indexOf('data-hear-after-need-two="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedNeedFour = embed.indexOf('data-need-after-hear-four="true"');
  const embedNeedThree = embed.indexOf('data-need-after-hear-three="true"');
  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedHearAfterNeedFour, -1);
  assert.notEqual(embedHearAfterNeedThree, -1);
  assert.notEqual(embedHearAfterNeedTwo, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedNeedFour, -1);
  assert.notEqual(embedNeedThree, -1);
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedHearAfterNeedTwo || embedHearAfterNeedTwo === embedHearAfterNeed);
  assert.ok(embedHearAfterNeedTwo < embedHearAfterNeedThree || embedHearAfterNeedThree === embedHearAfterNeedTwo);
  assert.ok(embedHearAfterNeedThree < embedHearAfterNeedFour || embedHearAfterNeedFour === embedHearAfterNeedThree);
  assert.ok(embedHearAfterNeedFour < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNeedThree || embedNeedThree === embedNeedTwo);
  assert.ok(embedNeedThree < embedNeedFour || embedNeedFour === embedNeedThree);
  assert.ok(embedNeedFour < embedNote);
  assert.ok(embedHear < embedNeedFour);
  assert.ok(embedNeedFour < embedClaim);
  assert.equal((embed.match(/data-hear-after-need-four="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four(?: hear-after-need-five)?"/);
  assert.match(embed, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four(?: need-after-hear-five)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-need-four/);
  assert.doesNotMatch(empty, /hear-after-need-four/);
  assert.doesNotMatch(empty, /data-hear-after-need-three/);
  assert.doesNotMatch(empty, /hear-after-need-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-four/);
  assert.doesNotMatch(empty, /need-after-hear-four/);
  assert.doesNotMatch(empty, /data-need-after-hear-three/);
  assert.doesNotMatch(empty, /need-after-hear-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied Need $N after Hear is re-concentrated again after a louder Hear again is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearAfterNeedTwo = hop.indexOf('data-hear-after-need-two="true"');
  const hearAfterNeedThree = hop.indexOf('data-hear-after-need-three="true"');
  const hearAfterNeedFour = hop.indexOf('data-hear-after-need-four="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const needAfterThree = hop.indexOf('data-need-after-hear-three="true"');
  const needAfterFour = hop.indexOf('data-need-after-hear-four="true"');
  const needAfterFive = hop.indexOf('data-need-after-hear-five="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearAfterNeedTwo, -1);
  assert.notEqual(hearAfterNeedThree, -1);
  assert.notEqual(hearAfterNeedFour, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(needAfterThree, -1);
  assert.notEqual(needAfterFour, -1);
  assert.notEqual(needAfterFive, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < hearAfterNeedTwo || hearAfterNeedTwo === hearAfterNeed);
  assert.ok(hearAfterNeedTwo < hearAfterNeedThree || hearAfterNeedThree === hearAfterNeedTwo);
  assert.ok(hearAfterNeedThree < hearAfterNeedFour || hearAfterNeedFour === hearAfterNeedThree);
  assert.ok(hearAfterNeedFour < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(needAfterTwo < needAfterThree || needAfterThree === needAfterTwo);
  assert.ok(needAfterThree < needAfterFour || needAfterFour === needAfterThree);
  assert.ok(needAfterFour < needAfterFive || needAfterFive === needAfterFour);
  assert.ok(Math.abs(needAfterFive - needAfter) < 260);
  assert.ok(needAfterFive < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(needAfterFive < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-need-after-hear-five="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-four="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-need-after-hear-five="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"/);
  assert.match(hop, /data-need-after-hear-four="true"/);
  assert.match(hop, /data-need-after-hear-three="true"/);
  assert.match(hop, /data-need-after-hear-two="true"/);
  assert.match(hop, /data-need-after-hear="true"/);
  assert.match(hop, /data-hear-after-need-four="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four(?: hear-after-need-five)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const needFiveRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four\.need-after-hear-five \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFourRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{\n  min-height: 3\.65rem;[\s\S]*?\n\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(needThreeRule);
  assert.ok(needFourRule);
  assert.ok(needFiveRule);
  assert.ok(hearAfterNeedRule);
  assert.ok(hearAfterNeedTwoRule);
  assert.ok(hearAfterNeedThreeRule);
  assert.ok(hearAfterNeedFourRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(needThreeRule[0], /min-height: 2\.75rem/);
  assert.match(needThreeRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(needThreeRule[0], /background:/);
  assert.doesNotMatch(needThreeRule[0], /border:/);
  assert.match(needFourRule[0], /min-height: 3\.05rem/);
  assert.match(needFourRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(needFourRule[0], /background:/);
  assert.doesNotMatch(needFourRule[0], /border:/);
  assert.match(needFiveRule[0], /min-height: 3\.35rem/);
  assert.match(needFiveRule[0], /font-size: 1\.22rem/);
  assert.doesNotMatch(needFiveRule[0], /background:/);
  assert.doesNotMatch(needFiveRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(hearAfterNeedTwoRule[0], /min-height: 3\.05rem/);
  assert.match(hearAfterNeedTwoRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /border:/);
  assert.match(hearAfterNeedThreeRule[0], /min-height: 3\.35rem/);
  assert.match(hearAfterNeedThreeRule[0], /font-size: 1\.22rem/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /border:/);
  assert.match(hearAfterNeedFourRule[0], /min-height: 3\.65rem/);
  assert.match(hearAfterNeedFourRule[0], /font-size: 1\.32rem/);
  assert.doesNotMatch(hearAfterNeedFourRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedFourRule[0], /border:/);
  assert.ok(
    hearAfterNeedFourRule[0].includes("3.65rem") &&
      needFiveRule[0].includes("3.35rem"),
    "Need $N after Hear is re-concentrated again must stay shorter than the louder Hear",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needThreeRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needFourRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needFiveRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /data-need-after-hear-six/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedNeedFive = embed.indexOf('data-need-after-hear-five="true"');
  const embedNeedFour = embed.indexOf('data-need-after-hear-four="true"');
  const embedNeedThree = embed.indexOf('data-need-after-hear-three="true"');
  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHearAfterNeedFour = embed.indexOf('data-hear-after-need-four="true"');
  const embedHearAfterNeedThree = embed.indexOf('data-hear-after-need-three="true"');
  const embedHearAfterNeedTwo = embed.indexOf('data-hear-after-need-two="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedNeedFive, -1);
  assert.notEqual(embedNeedFour, -1);
  assert.notEqual(embedNeedThree, -1);
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHearAfterNeedFour, -1);
  assert.notEqual(embedHearAfterNeedThree, -1);
  assert.notEqual(embedHearAfterNeedTwo, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedHearAfterNeedTwo || embedHearAfterNeedTwo === embedHearAfterNeed);
  assert.ok(embedHearAfterNeedTwo < embedHearAfterNeedThree || embedHearAfterNeedThree === embedHearAfterNeedTwo);
  assert.ok(embedHearAfterNeedThree < embedHearAfterNeedFour || embedHearAfterNeedFour === embedHearAfterNeedThree);
  assert.ok(embedHearAfterNeedFour < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNeedThree || embedNeedThree === embedNeedTwo);
  assert.ok(embedNeedThree < embedNeedFour || embedNeedFour === embedNeedThree);
  assert.ok(embedNeedFour < embedNeedFive || embedNeedFive === embedNeedFour);
  assert.ok(embedNeedFive < embedNote);
  assert.ok(embedHear < embedNeedFive);
  assert.ok(embedNeedFive < embedClaim);
  assert.equal((embed.match(/data-need-after-hear-five="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-four="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"/);
  assert.match(embed, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four(?: hear-after-need-five)?"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-need-after-hear-five/);
  assert.doesNotMatch(empty, /need-after-hear-five/);
  assert.doesNotMatch(empty, /data-need-after-hear-four/);
  assert.doesNotMatch(empty, /need-after-hear-four/);
  assert.doesNotMatch(empty, /data-need-after-hear-three/);
  assert.doesNotMatch(empty, /need-after-hear-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied hear after Need $N is re-concentrated again after a louder Need again is certain", () => {
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const empty = renderBoard([]);

  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearOne = hop.indexOf('data-hear-one-first="true"');
  const hearAfterNeed = hop.indexOf('data-hear-after-need="true"');
  const hearAfterNeedTwo = hop.indexOf('data-hear-after-need-two="true"');
  const hearAfterNeedThree = hop.indexOf('data-hear-after-need-three="true"');
  const hearAfterNeedFour = hop.indexOf('data-hear-after-need-four="true"');
  const hearAfterNeedFive = hop.indexOf('data-hear-after-need-five="true"');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const needAfter = hop.indexOf('data-need-after-hear="true"');
  const needAfterTwo = hop.indexOf('data-need-after-hear-two="true"');
  const needAfterThree = hop.indexOf('data-need-after-hear-three="true"');
  const needAfterFour = hop.indexOf('data-need-after-hear-four="true"');
  const needAfterFive = hop.indexOf('data-need-after-hear-five="true"');
  const raiseHop = hop.indexOf('data-raise-after-hear="true"');
  const raiseNote = hop.indexOf('data-raise-note="difference"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearOne, -1);
  assert.notEqual(hearAfterNeed, -1);
  assert.notEqual(hearAfterNeedTwo, -1);
  assert.notEqual(hearAfterNeedThree, -1);
  assert.notEqual(hearAfterNeedFour, -1);
  assert.notEqual(hearAfterNeedFive, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(needAfter, -1);
  assert.notEqual(needAfterTwo, -1);
  assert.notEqual(needAfterThree, -1);
  assert.notEqual(needAfterFour, -1);
  assert.notEqual(needAfterFive, -1);
  assert.notEqual(raiseHop, -1);
  assert.notEqual(raiseNote, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.ok(firstRead < hearAfterNeed);
  assert.ok(firstClick < hearAfterNeed);
  assert.ok(hearAfterNeed < hearAfterNeedTwo || hearAfterNeedTwo === hearAfterNeed);
  assert.ok(hearAfterNeedTwo < hearAfterNeedThree || hearAfterNeedThree === hearAfterNeedTwo);
  assert.ok(hearAfterNeedThree < hearAfterNeedFour || hearAfterNeedFour === hearAfterNeedThree);
  assert.ok(hearAfterNeedFour < hearAfterNeedFive || hearAfterNeedFive === hearAfterNeedFour);
  assert.ok(Math.abs(hearAfterNeedFive - hearAfterNeed) < 280);
  assert.ok(hearAfterNeedFive < needAfter);
  assert.ok(hearHop < needAfter);
  assert.ok(needAfter < needAfterTwo || needAfterTwo === needAfter);
  assert.ok(needAfterTwo < needAfterThree || needAfterThree === needAfterTwo);
  assert.ok(needAfterThree < needAfterFour || needAfterFour === needAfterThree);
  assert.ok(needAfterFour < needAfterFive || needAfterFive === needAfterFour);
  assert.ok(needAfterFive < raiseNote);
  assert.ok(needCopy < difference);
  assert.ok(hearAfterNeedFive < claim);
  assert.ok(needAfterFive < claim);
  assert.ok(difference < claim);
  assert.equal((hop.match(/data-hear-after-need-five="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-four="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-five="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-hear-after-need-five="true"/);
  assert.match(hop, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"/);
  assert.match(hop, /data-hear-after-need-four="true"/);
  assert.match(hop, /data-hear-after-need-three="true"/);
  assert.match(hop, /data-hear-after-need-two="true"/);
  assert.match(hop, /data-hear-after-need="true"/);
  assert.match(hop, /data-need-after-hear-five="true"/);
  assert.match(hop, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const needFiveRule = cssSource.match(
    /^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four\.need-after-hear-five \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFourRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{\n  min-height: 3\.65rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFiveRule = cssSource.match(
    /^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four\.hear-after-need-five \{\n  min-height: 3\.95rem;[\s\S]*?\n\}/m,
  );
  assert.ok(needRule);
  assert.ok(needTwoRule);
  assert.ok(needThreeRule);
  assert.ok(needFourRule);
  assert.ok(needFiveRule);
  assert.ok(hearAfterNeedRule);
  assert.ok(hearAfterNeedTwoRule);
  assert.ok(hearAfterNeedThreeRule);
  assert.ok(hearAfterNeedFourRule);
  assert.ok(hearAfterNeedFiveRule);
  assert.match(needRule[0], /display: inline-flex/);
  assert.match(needRule[0], /min-height: 2\.15rem/);
  assert.match(needRule[0], /border: 2px dashed/);
  assert.match(needRule[0], /background: transparent/);
  assert.match(needTwoRule[0], /min-height: 2\.45rem/);
  assert.match(needTwoRule[0], /font-size: 0\.92rem/);
  assert.doesNotMatch(needTwoRule[0], /background:/);
  assert.doesNotMatch(needTwoRule[0], /border:/);
  assert.match(needThreeRule[0], /min-height: 2\.75rem/);
  assert.match(needThreeRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(needThreeRule[0], /background:/);
  assert.doesNotMatch(needThreeRule[0], /border:/);
  assert.match(needFourRule[0], /min-height: 3\.05rem/);
  assert.match(needFourRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(needFourRule[0], /background:/);
  assert.doesNotMatch(needFourRule[0], /border:/);
  assert.match(needFiveRule[0], /min-height: 3\.35rem/);
  assert.match(needFiveRule[0], /font-size: 1\.22rem/);
  assert.doesNotMatch(needFiveRule[0], /background:/);
  assert.doesNotMatch(needFiveRule[0], /border:/);
  assert.match(hearAfterNeedRule[0], /min-height: 2\.75rem/);
  assert.match(hearAfterNeedRule[0], /font-size: 1\.02rem/);
  assert.doesNotMatch(hearAfterNeedRule[0], /background:/);
  assert.match(hearAfterNeedTwoRule[0], /min-height: 3\.05rem/);
  assert.match(hearAfterNeedTwoRule[0], /font-size: 1\.12rem/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedTwoRule[0], /border:/);
  assert.match(hearAfterNeedThreeRule[0], /min-height: 3\.35rem/);
  assert.match(hearAfterNeedThreeRule[0], /font-size: 1\.22rem/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedThreeRule[0], /border:/);
  assert.match(hearAfterNeedFourRule[0], /min-height: 3\.65rem/);
  assert.match(hearAfterNeedFourRule[0], /font-size: 1\.32rem/);
  assert.doesNotMatch(hearAfterNeedFourRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedFourRule[0], /border:/);
  assert.match(hearAfterNeedFiveRule[0], /min-height: 3\.95rem/);
  assert.match(hearAfterNeedFiveRule[0], /font-size: 1\.42rem/);
  assert.doesNotMatch(hearAfterNeedFiveRule[0], /background:/);
  assert.doesNotMatch(hearAfterNeedFiveRule[0], /border:/);
  assert.ok(
    hearAfterNeedFiveRule[0].includes("3.95rem") &&
      needFiveRule[0].includes("3.35rem"),
    "Hear after Need $N is re-concentrated again after a louder Need again must stay taller than Need $N",
  );
  assert.doesNotMatch(needRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needTwoRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needThreeRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needFourRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(needFiveRule[0], /background: var\(--ink\)/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /data-hear-after-difference/);
  assert.doesNotMatch(hop, /data-hear-after-need-six/);
  assert.doesNotMatch(hop, /data-need-after-hear-six/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embedHearAfterNeedFive = embed.indexOf('data-hear-after-need-five="true"');
  const embedHearAfterNeedFour = embed.indexOf('data-hear-after-need-four="true"');
  const embedHearAfterNeedThree = embed.indexOf('data-hear-after-need-three="true"');
  const embedHearAfterNeedTwo = embed.indexOf('data-hear-after-need-two="true"');
  const embedHearAfterNeed = embed.indexOf('data-hear-after-need="true"');
  const embedNeedFive = embed.indexOf('data-need-after-hear-five="true"');
  const embedNeedFour = embed.indexOf('data-need-after-hear-four="true"');
  const embedNeedThree = embed.indexOf('data-need-after-hear-three="true"');
  const embedNeedTwo = embed.indexOf('data-need-after-hear-two="true"');
  const embedNeed = embed.indexOf('data-need-after-hear="true"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedNote = embed.indexOf('data-raise-note="difference"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedHearAfterNeedFive, -1);
  assert.notEqual(embedHearAfterNeedFour, -1);
  assert.notEqual(embedHearAfterNeedThree, -1);
  assert.notEqual(embedHearAfterNeedTwo, -1);
  assert.notEqual(embedHearAfterNeed, -1);
  assert.notEqual(embedNeedFive, -1);
  assert.notEqual(embedNeedFour, -1);
  assert.notEqual(embedNeedThree, -1);
  assert.notEqual(embedNeedTwo, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedNote, -1);
  assert.ok(embed.indexOf('data-first-click="hear"') < embedHearAfterNeed);
  assert.ok(embedHearAfterNeed < embedHearAfterNeedTwo || embedHearAfterNeedTwo === embedHearAfterNeed);
  assert.ok(embedHearAfterNeedTwo < embedHearAfterNeedThree || embedHearAfterNeedThree === embedHearAfterNeedTwo);
  assert.ok(embedHearAfterNeedThree < embedHearAfterNeedFour || embedHearAfterNeedFour === embedHearAfterNeedThree);
  assert.ok(embedHearAfterNeedFour < embedHearAfterNeedFive || embedHearAfterNeedFive === embedHearAfterNeedFour);
  assert.ok(embedHearAfterNeedFive < embedNeed);
  assert.ok(embedNeed < embedNeedTwo || embedNeedTwo === embedNeed);
  assert.ok(embedNeedTwo < embedNeedThree || embedNeedThree === embedNeedTwo);
  assert.ok(embedNeedThree < embedNeedFour || embedNeedFour === embedNeedThree);
  assert.ok(embedNeedFour < embedNeedFive || embedNeedFive === embedNeedFour);
  assert.ok(embedNeedFive < embedNote);
  assert.ok(embedHear < embedNeedFive);
  assert.ok(embedNeedFive < embedClaim);
  assert.equal((embed.match(/data-hear-after-need-five="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-four="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-need="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-five="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-four="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-three="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear-two="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-need-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-one-first="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#hear-opening"/g) ?? []).length, 1);
  assert.equal((embed.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"/);
  assert.match(embed, /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Same listen URL pays only the difference/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, /data-hear-after-difference/);
  assert.doesNotMatch(embed, /data-hear-after-need-six/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-need-five/);
  assert.doesNotMatch(empty, /hear-after-need-five/);
  assert.doesNotMatch(empty, /data-hear-after-need-four/);
  assert.doesNotMatch(empty, /hear-after-need-four/);
  assert.doesNotMatch(empty, /data-hear-after-need-three/);
  assert.doesNotMatch(empty, /hear-after-need-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-five/);
  assert.doesNotMatch(empty, /need-after-hear-five/);
  assert.doesNotMatch(empty, /data-need-after-hear-four/);
  assert.doesNotMatch(empty, /need-after-hear-four/);
  assert.doesNotMatch(empty, /data-need-after-hear-three/);
  assert.doesNotMatch(empty, /need-after-hear-three/);
  assert.doesNotMatch(empty, /data-need-after-hear-two/);
  assert.doesNotMatch(empty, /need-after-hear-two/);
  assert.doesNotMatch(empty, /data-need-after-hear=/);
  assert.doesNotMatch(empty, /class="need-after-hear"/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /hear-after-need/);
  assert.doesNotMatch(empty, /data-hear-one-first/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied #1 track title reads first and larger than $bid and clicks", () => {
  const prizeSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track\s*\{[^}]*font-size:\s*clamp\(([\d.]+)rem/,
  );
  const bidSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.bid\s*\{[^}]*font-size:\s*([\d.]+)rem/,
  );
  const clickSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.clicks\s*\{[^}]*font-size:\s*([\d.]+)rem/,
  );
  assert.ok(prizeSize);
  assert.ok(bidSize);
  assert.ok(clickSize);
  assert.ok(Number(prizeSize[1]) > Number(bidSize[1]));
  assert.ok(Number(prizeSize[1]) > Number(clickSize[1]));
  assert.match(cssSource, /clamp\(2\.85rem, 8vw, 4\.4rem\)/);
  assert.doesNotMatch(
    cssSource.match(
      /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track\s*\{[^}]+\}/,
    )?.[0] ?? "",
    /background:/,
  );

  const empty = renderBoard([]);
  assert.doesNotMatch(empty, /data-prize-before-price/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /No opening song/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  const prizeStamp = hop.indexOf('data-prize-before-price=""');
  const prize = hop.indexOf('data-prize=""');
  const title = hop.indexOf(">Cold Open<", prize);
  const bid = hop.indexOf('data-bid=""', prize);
  const clicks = hop.indexOf("data-clicks", prize);
  const laterTitle = hop.indexOf('<p class="later-track" data-later-track="">Second Slot</p>');
  const laterBid = hop.indexOf('data-bid=""', laterTitle);
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(prizeStamp, -1);
  assert.notEqual(prize, -1);
  assert.notEqual(title, -1);
  assert.notEqual(bid, -1);
  assert.notEqual(clicks, -1);
  assert.notEqual(laterTitle, -1);
  assert.notEqual(laterBid, -1);
  assert.notEqual(claim, -1);
  assert.ok(prizeStamp < prize);
  assert.ok(prize < title);
  assert.ok(title < bid);
  assert.ok(bid < clicks);
  assert.ok(clicks < laterTitle);
  assert.ok(laterTitle < laterBid);
  assert.ok(title < claim);
  assert.equal((hop.match(/data-prize-before-price=""/g) ?? []).length, 1);
  assert.equal((hop.match(/data-prize=""/g) ?? []).length, 1);
  assert.match(hop, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(hop, /\$12/);
  assert.match(hop, /4 clicks/);
  assert.match(hop, /data-hear-opening="hop"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, FORBIDDEN);
  assert.doesNotMatch(hop.slice(laterTitle), /data-prize-before-price|data-prize=/);

  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const embedPrize = embed.indexOf('data-prize=""');
  const embedTitle = embed.indexOf(">Cold Open<", embedPrize);
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedBid = embed.indexOf('data-bid=""', embedPrize);
  assert.notEqual(embedPrize, -1);
  assert.notEqual(embedTitle, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedBid, -1);
  assert.ok(embed.indexOf('data-prize-before-price=""') < embedPrize);
  assert.ok(embedPrize < embedTitle);
  assert.ok(embedTitle < embedHear);
  assert.ok(embedHear < embedBid);
  assert.equal((embed.match(/data-prize-before-price=""/g) ?? []).length, 1);
  assert.equal((embed.match(/data-prize=""/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /Need \$13 to take #1/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);
});

test("empty week stays Bid USD / $5 and does not invent Hear", () => {
  const empty = renderBoard([]);
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);

  const bidRead = empty.indexOf('data-first-read="bid"');
  const bidCopy = empty.indexOf("Bid USD");
  const fiveCopy = empty.indexOf("$5 claims last 7 days");
  const emptyStamp = empty.indexOf('data-empty-bid-five=""');
  const claimNote = empty.indexOf('data-empty-bid-five=""', emptyStamp + 1);
  const claim = empty.indexOf('id="claim"');
  const emptyDeck = empty.indexOf('data-empty-week="true"');
  assert.notEqual(bidRead, -1);
  assert.notEqual(bidCopy, -1);
  assert.notEqual(fiveCopy, -1);
  assert.notEqual(emptyStamp, -1);
  assert.notEqual(claimNote, -1);
  assert.notEqual(claim, -1);
  assert.notEqual(emptyDeck, -1);
  assert.ok(emptyStamp < bidRead);
  assert.ok(bidRead <= bidCopy);
  assert.ok(bidCopy < claim);
  assert.ok(claim <= claimNote);
  assert.ok(fiveCopy > claim);
  assert.equal((empty.match(/data-empty-bid-five=""/g) ?? []).length, 2);
  assert.match(empty, /class="board station week-empty"/);
  assert.match(empty, /data-week-empty="true"/);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-opening-song="false"/);
  assert.match(empty, /data-claim-opening="empty"/);
  assert.match(empty, /data-claim-note="empty"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /No opening song/);
  assert.match(empty, /Nobody has paid yet/);
  assert.match(empty, /There is no player last 7 days/);
  assert.match(empty, /class="station-desk"/);
  assert.match(empty, /claim-rail/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /href="#claim"/);
  assert.doesNotMatch(empty, /data-raise-after-hear/);
  assert.doesNotMatch(empty, /data-need-after-hear/);
  assert.doesNotMatch(empty, /data-hear-after-need/);
  assert.doesNotMatch(empty, /data-prize-before-price/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.doesNotMatch(empty, /opening-track/);
  assert.doesNotMatch(empty, /LIVE OPEN/);
  assert.doesNotMatch(empty, /data-playback=/);
  assert.doesNotMatch(empty, /<iframe/);
  assert.doesNotMatch(empty, /<audio/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /class="station-desk hear-first"/);
  assert.doesNotMatch(empty, /class="board station week-occupied"/);
  assert.doesNotMatch(empty, /data-week-occupied/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.match(
    cssSource,
    /\.board\[data-empty-bid-five\] \.hear-after-raise/,
  );
  assert.match(cssSource, /\.board\[data-empty-bid-five\] \.need-after-hear/);
  assert.match(cssSource, /\.board\[data-empty-bid-five\] \[data-prize\]/);
  assert.match(cssSource, /\.week-empty\[data-empty-bid-five\] \[data-hear-opening\]/);
  assert.match(cssSource, /\.week-empty\[data-empty-bid-five\] \[data-prize\]/);
  assert.match(cssSource, /\.week-empty \.opening-listen/);
  assert.match(cssSource, /\.week-empty \.need-after-hear/);
  assert.match(cssSource, /\.week-empty \[data-later-fact\]/);
  assert.match(cssSource, /\.week-empty \[data-real-playback\]/);
  assert.match(cssSource, /\.week-empty \.player/);
  assert.match(cssSource, /\.week-occupied \.empty-deck/);
  assert.match(cssSource, /\.week-occupied \.opening-listen \{/);
  assert.match(cssSource, /\.week-occupied \.need-after-hear \{/);
  assert.match(
    cssSource,
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track/,
  );
  assert.doesNotMatch(
    cssSource.match(/^\.opening-listen \{/m)?.[0] ?? "",
    /background:/,
  );
  assert.doesNotMatch(cssSource, /^\.need-after-hear \{/m);
  assert.doesNotMatch(cssSource, /^\.opening-listen \{/m);
  assert.doesNotMatch(cssSource, /^\.studio-deck\[data-prize-before-price\]/m);
  assert.doesNotMatch(
    cssSource.match(/\.board\[data-empty-bid-five\][\s\S]*?\n\}/)?.[0] ?? "",
    /background:/,
  );

  assert.doesNotMatch(hop, /data-empty-bid-five/);
  assert.doesNotMatch(hop, /data-first-read="bid"/);
  assert.doesNotMatch(hop, /Bid USD/);
  assert.doesNotMatch(hop, /\$5 claims last 7 days/);
  assert.match(hop, /data-first-read="hear"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /data-prize-before-price=""/);
  assert.match(hop, /data-prize=""/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.match(hop, /class="board station week-occupied"/);
  assert.match(hop, /data-week-occupied="true"/);
  assert.doesNotMatch(hop, /class="board station week-empty"/);
  assert.doesNotMatch(hop, /data-week-empty/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, FORBIDDEN);

  assert.doesNotMatch(embed, /data-empty-bid-five/);
  assert.doesNotMatch(embed, /data-first-read="bid"/);
  assert.match(embed, /data-hear-opening="embed"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /data-prize=""/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.match(formSource, /data-empty-bid-five=\{occupied \? undefined : ""\}/);
  assert.match(pageSource, /data-empty-bid-five=\{emptyWeek \? "" : undefined\}/);
  assert.match(pageSource, /board station week-empty/);
  assert.match(pageSource, /board station week-occupied/);
  assert.match(pageSource, /data-week-empty/);
  assert.match(pageSource, /data-week-occupied/);
  assert.match(pageSource, /station-desk/);
  assert.match(pageSource, /claim-rail/);
  assert.match(pageSource, /data-hear-opening/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /className="amount-field"/);
  assert.match(formSource, /Outbid/);
});

test("empty week stays Bid USD / $5 — song-prize / Hear cannot leak", () => {
  const empty = renderBoard([]);
  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
  ]);
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);

  const weekAt = empty.indexOf('class="board station week-empty"');
  const emptyWeekStamp = empty.indexOf('data-week-empty="true"');
  const bidFive = empty.indexOf('data-empty-bid-five=""');
  const bidRead = empty.indexOf('data-first-read="bid"');
  const bidCopy = empty.indexOf("Bid USD");
  const emptyDeck = empty.indexOf('data-empty-week="true"');
  const fiveCopy = empty.indexOf("$5 claims last 7 days");
  const claim = empty.indexOf('id="claim"');
  assert.notEqual(weekAt, -1);
  assert.notEqual(emptyWeekStamp, -1);
  assert.notEqual(bidFive, -1);
  assert.notEqual(bidRead, -1);
  assert.notEqual(bidCopy, -1);
  assert.notEqual(emptyDeck, -1);
  assert.notEqual(fiveCopy, -1);
  assert.notEqual(claim, -1);
  assert.ok(weekAt < emptyWeekStamp || emptyWeekStamp - weekAt < 80);
  assert.ok(weekAt < bidRead);
  assert.ok(bidRead <= bidCopy);
  assert.ok(bidCopy < claim);
  assert.ok(emptyDeck < claim);
  assert.ok(fiveCopy > claim);
  assert.match(empty, /class="board station week-empty"/);
  assert.match(empty, /data-week-empty="true"/);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /No opening song/);
  assert.match(empty, /Nobody has paid yet/);
  assert.match(empty, /There is no player last 7 days/);
  assert.match(empty, /class="station-desk"/);
  assert.match(empty, /claim-rail/);
  assert.doesNotMatch(empty, /class="board station week-occupied"/);
  assert.doesNotMatch(empty, /data-week-occupied/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /href="#claim"/);
  assert.doesNotMatch(empty, /data-prize-before-price/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.doesNotMatch(empty, /data-later-fact/);
  assert.doesNotMatch(empty, /later-fact/);
  assert.doesNotMatch(empty, /data-real-playback/);
  assert.doesNotMatch(empty, /data-stored-listen/);
  assert.doesNotMatch(empty, /LIVE OPEN/);
  assert.doesNotMatch(empty, /opening-track/);
  assert.doesNotMatch(empty, /<iframe/);
  assert.doesNotMatch(empty, /<audio/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, /Not bidding\?/);
  assert.doesNotMatch(empty, /class="station-desk hear-first"/);
  assert.doesNotMatch(empty, FORBIDDEN);

  assert.match(cssSource, /\.week-empty\[data-empty-bid-five\] \[data-hear-opening\]/);
  assert.match(cssSource, /\.week-empty\[data-empty-bid-five\] \[data-prize\]/);
  assert.match(cssSource, /\.week-empty\[data-empty-bid-five\] \[data-later-fact\]/);
  assert.match(cssSource, /\.week-empty\[data-empty-bid-five\] \[data-real-playback\]/);
  assert.match(cssSource, /\.week-empty \.opening-listen/);
  assert.match(cssSource, /\.week-empty \.need-after-hear/);
  assert.match(cssSource, /\.week-empty \.player/);
  assert.match(cssSource, /\.week-occupied \.empty-deck/);
  assert.match(cssSource, /\.week-occupied \.opening-listen \{/);
  assert.match(cssSource, /\.week-occupied \.need-after-hear \{/);
  assert.match(
    cssSource,
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track/,
  );
  assert.match(
    cssSource,
    /\.week-occupied \.studio-deck\[data-real-playback\] \.player/,
  );
  const emptyHide =
    cssSource.match(
      /\.board\[data-empty-bid-five\] \.hear-after-raise,[\s\S]*?display: none;/,
    )?.[0] ?? "";
  assert.match(emptyHide, /display: none/);
  assert.match(emptyHide, /\.week-empty\[data-empty-bid-five\] \[data-hear-opening\]/);
  assert.match(emptyHide, /\.week-empty \.player/);
  assert.doesNotMatch(emptyHide, /background:/);
  assert.doesNotMatch(cssSource, /^\.opening-listen \{/m);
  assert.doesNotMatch(cssSource, /^\.need-after-hear \{/m);
  assert.doesNotMatch(cssSource, /^\.studio-deck\[data-prize-before-price\]/m);
  assert.doesNotMatch(cssSource, /^\.studio-deck\[data-real-playback\]/m);
  assert.doesNotMatch(pageSource, /data-hear-after-need-six/);
  assert.doesNotMatch(pageSource, /data-need-after-hear-six/);

  assert.match(hop, /class="board station week-occupied"/);
  assert.match(hop, /data-week-occupied="true"/);
  assert.match(hop, /data-first-read="hear"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /data-prize-before-price=""/);
  assert.match(hop, /data-prize=""/);
  assert.match(hop, /data-later-fact=""/);
  assert.match(hop, /data-real-playback="hop"/);
  assert.match(hop, /data-hear-opening="hop"/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /class="board station week-empty"/);
  assert.doesNotMatch(hop, /data-week-empty/);
  assert.doesNotMatch(hop, /data-empty-bid-five/);
  assert.doesNotMatch(hop, /data-first-read="bid"/);
  assert.doesNotMatch(hop, /Bid USD/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, FORBIDDEN);

  assert.match(embed, /class="board station week-occupied"/);
  assert.match(embed, /data-hear-opening="embed"/);
  assert.match(embed, /data-real-playback="embed"/);
  assert.match(embed, /data-prize=""/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.doesNotMatch(embed, /class="board station week-empty"/);
  assert.doesNotMatch(embed, /data-empty-bid-five/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.match(pageSource, /board station week-empty/);
  assert.match(pageSource, /board station week-occupied/);
  assert.match(pageSource, /data-week-empty=\{emptyWeek \? "true" : undefined\}/);
  assert.match(pageSource, /data-week-occupied=\{emptyWeek \? undefined : "true"\}/);
  assert.match(pageSource, /data-empty-bid-five=\{emptyWeek \? "" : undefined\}/);
  assert.match(pageSource, /station-desk/);
  assert.match(pageSource, /claim-rail/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /className="amount-field"/);
  assert.match(formSource, /Outbid/);
});

test("occupied #1 playback is real and does not invent play counts", () => {
  const playerRule = cssSource.match(
    /\.week-occupied \.studio-deck\[data-real-playback\] \.player\s*\{[^}]*min-height:\s*([\d.]+)rem/,
  );
  const hopHostRule = cssSource.match(
    /\.week-occupied \.studio-deck\[data-real-playback="hop"\] \.hear-row \.listen-host\s*\{[^}]*font-size:\s*([\d.]+)rem/,
  );
  const clickNoteRule = cssSource.match(
    /\.week-occupied \.studio-deck\[data-real-playback\] \.click-note\s*\{[^}]*font-size:\s*([\d.]+)rem/,
  );
  assert.ok(playerRule);
  assert.ok(hopHostRule);
  assert.ok(clickNoteRule);
  assert.ok(Number(playerRule[1]) > 14);
  assert.ok(Number(hopHostRule[1]) > 0.72);
  assert.ok(Number(clickNoteRule[1]) < Number(hopHostRule[1]));
  assert.doesNotMatch(
    cssSource.match(/\.week-occupied \.studio-deck\[data-real-playback\] \.player\s*\{[^}]+\}/)?.[0] ??
      "",
    /background:/,
  );
  assert.match(cssSource, /\.board\[data-empty-bid-five\] \[data-real-playback\]/);
  assert.match(cssSource, /\.board\[data-empty-bid-five\] \[data-clicks-are-hops\]/);
  assert.match(cssSource, /\.board\[data-empty-bid-five\] \[data-stored-listen\]/);

  const empty = renderBoard([]);
  assert.doesNotMatch(empty, /data-real-playback/);
  assert.doesNotMatch(empty, /data-clicks-are-hops/);
  assert.doesNotMatch(empty, /data-stored-listen/);
  assert.doesNotMatch(empty, /hops, not a platform count/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /No opening song/);
  assert.match(empty, /There is no player last 7 days/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /data-playback=/);
  assert.doesNotMatch(empty, /<iframe/);
  assert.doesNotMatch(empty, /<audio/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  const realStamp = hop.indexOf('data-real-playback="hop"');
  const stored = hop.indexOf('data-stored-listen=""');
  const storedUrl = hop.lastIndexOf(
    'data-listen-url="https://example.com/cold-open"',
    stored,
  );
  const hopsNote = hop.indexOf("hops, not a platform count");
  const clicksAreHops = hop.indexOf('data-clicks-are-hops=""');
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const clicksCopy = hop.indexOf("4 clicks");
  const laterCard = hop.indexOf('data-id="lst_two"');
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(realStamp, -1);
  assert.notEqual(stored, -1);
  assert.notEqual(storedUrl, -1);
  assert.notEqual(hopsNote, -1);
  assert.notEqual(clicksAreHops, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(clicksCopy, -1);
  assert.notEqual(laterCard, -1);
  assert.notEqual(claim, -1);
  assert.ok(hearHop < realStamp);
  assert.ok(realStamp < stored);
  assert.ok(stored < hopsNote);
  assert.ok(clicksAreHops < hopsNote);
  assert.ok(hopsNote < laterCard);
  assert.ok(hopsNote < claim);
  assert.equal((hop.match(/data-real-playback=/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.match(hop, /data-real-playback="hop"/);
  assert.match(hop, /data-stored-listen=""/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /data-clicks-are-hops=""/);
  assert.match(hop, /4 clicks/);
  assert.match(hop, /hops, not a platform count/);
  assert.match(hop, /data-prize-before-price=""/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /data-playback=/);
  assert.doesNotMatch(hop, /<iframe/);
  assert.doesNotMatch(hop, /<audio/);
  assert.doesNotMatch(hop, /generated\.mp3/);
  assert.doesNotMatch(hop, /\bplays\b/i);
  assert.doesNotMatch(hop, /\bstreams\b/i);
  assert.doesNotMatch(hop, /1\.2M/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, FORBIDDEN);
  assert.doesNotMatch(
    hop.slice(laterCard),
    /data-real-playback|data-clicks-are-hops|data-stored-listen/,
  );

  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
      clicks: 0,
    }),
  ]);
  const embedReal = embed.indexOf('data-real-playback="embed"');
  const embedPlayback = embed.indexOf('data-playback="embed"');
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedSrc = embed.indexOf('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
  const embedUrl = embed.indexOf(
    'data-listen-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"',
  );
  const embedClicks = embed.indexOf('data-clicks-are-hops=""');
  assert.notEqual(embedReal, -1);
  assert.notEqual(embedPlayback, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedSrc, -1);
  assert.notEqual(embedUrl, -1);
  assert.notEqual(embedClicks, -1);
  assert.ok(embed.indexOf('data-first-read="hear"') < embedHear);
  assert.ok(embedHear < embedReal || embedReal < embedPlayback);
  assert.ok(embedPlayback < embedClicks);
  assert.ok(embedSrc < embedClicks);
  assert.equal((embed.match(/data-real-playback=/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((embed.match(/<iframe/g) ?? []).length, 1);
  assert.match(embed, /data-real-playback="embed"/);
  assert.match(embed, /data-playback="embed"/);
  assert.match(embed, /src="https:\/\/www.youtube.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(embed, /data-listen-url="https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ"/);
  assert.match(embed, /href="\/click\/lst_embed"/);
  assert.match(embed, /hops, not a platform count/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, /data-real-playback="hop"/);
  assert.doesNotMatch(embed, /<audio/);
  assert.doesNotMatch(embed, /generated\.mp3/);
  assert.doesNotMatch(embed, /\bplays\b/i);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.match(pageSource, /data-real-playback=\{realPlayback\}/);
  assert.match(pageSource, /data-clicks-are-hops=/);
  assert.match(pageSource, /data-stored-listen=/);
  assert.match(pageSource, /hops, not a platform count/);
  assert.match(pageSource, /playbackForListing/);
  assert.match(pageSource, /listenClickPath/);
  assert.match(pageSource, /station-desk/);
  assert.match(pageSource, /claim-rail/);
  assert.match(pageSource, /data-empty-bid-five/);
  assert.doesNotMatch(pageSource, /data-hear-after-need-six/);
  assert.doesNotMatch(pageSource, /data-need-after-hear-six/);
});

test("occupied #1 $bid stays a later fact and does not shout beside the song title", () => {
  const prizeSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track\s*\{[^}]*font-size:\s*clamp\(([\d.]+)rem/,
  );
  const bidSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.bid\s*\{[^}]*font-size:\s*([\d.]+)rem/,
  );
  const clickSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.clicks\s*\{[^}]*font-size:\s*([\d.]+)rem/,
  );
  const laterFactsRule = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts\.later-fact\[data-later-fact\]\s*\{[^}]+\}/,
  );
  const laterBidRule = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.bid\.later-fact\[data-later-fact\],\s*\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.clicks\.later-fact\[data-later-fact\]\s*\{[^}]+\}/,
  );
  assert.ok(prizeSize);
  assert.ok(bidSize);
  assert.ok(clickSize);
  assert.ok(laterFactsRule);
  assert.ok(laterBidRule);
  assert.ok(Number(prizeSize[1]) > Number(bidSize[1]));
  assert.ok(Number(prizeSize[1]) > Number(clickSize[1]));
  assert.match(laterFactsRule[0], /font-weight:\s*500/);
  assert.doesNotMatch(laterFactsRule[0], /background:/);
  assert.match(laterBidRule[0], /color:\s*var\(--muted\)/);
  assert.match(laterBidRule[0], /font-weight:\s*500/);
  assert.doesNotMatch(laterBidRule[0], /color:\s*var\(--primary\)/);
  assert.doesNotMatch(laterBidRule[0], /background:/);
  assert.match(
    cssSource,
    /\.board\[data-empty-bid-five\] \[data-later-fact\]/,
  );
  assert.match(cssSource, /\.board\[data-empty-bid-five\] \.later-fact/);

  const empty = renderBoard([]);
  assert.doesNotMatch(empty, /data-later-fact/);
  assert.doesNotMatch(empty, /later-fact/);
  assert.doesNotMatch(empty, /data-prize-before-price/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /No opening song/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  const prizeStamp = hop.indexOf('data-prize-before-price=""');
  const prize = hop.indexOf('data-prize=""');
  const title = hop.indexOf(">Cold Open<", prize);
  const laterFacts = hop.indexOf('class="opening-facts later-fact"');
  const laterFactsStamp = hop.indexOf('data-later-fact=""', laterFacts);
  const bidClass = hop.indexOf('class="bid later-fact"');
  const laterBidStamp = hop.indexOf('data-later-fact=""', bidClass);
  const bid = hop.indexOf("$12", laterBidStamp);
  const clicksClass = hop.indexOf('class="clicks later-fact"');
  const laterClicksStamp = hop.indexOf('data-later-fact=""', clicksClass);
  const clicks = hop.indexOf("4 clicks", laterClicksStamp);
  const laterTitle = hop.indexOf('<p class="later-track" data-later-track="">Second Slot</p>');
  const laterBid = hop.indexOf('class="bid"', laterTitle);
  const laterCard = hop.indexOf('data-id="lst_two"');
  const claim = hop.indexOf('id="claim"');
  assert.notEqual(prizeStamp, -1);
  assert.notEqual(prize, -1);
  assert.notEqual(title, -1);
  assert.notEqual(laterFacts, -1);
  assert.notEqual(laterFactsStamp, -1);
  assert.notEqual(bidClass, -1);
  assert.notEqual(laterBidStamp, -1);
  assert.notEqual(bid, -1);
  assert.notEqual(clicksClass, -1);
  assert.notEqual(laterClicksStamp, -1);
  assert.notEqual(clicks, -1);
  assert.notEqual(laterTitle, -1);
  assert.notEqual(laterBid, -1);
  assert.notEqual(laterCard, -1);
  assert.notEqual(claim, -1);
  assert.ok(prizeStamp < prize);
  assert.ok(prize < title);
  assert.ok(title < laterFacts);
  assert.ok(laterFacts < laterFactsStamp);
  assert.ok(laterFactsStamp < bidClass);
  assert.ok(bidClass < laterBidStamp);
  assert.ok(laterBidStamp < bid);
  assert.ok(bid < clicksClass);
  assert.ok(clicksClass < laterClicksStamp);
  assert.ok(laterClicksStamp < clicks);
  assert.ok(clicks < laterTitle);
  assert.ok(laterTitle < laterBid);
  assert.ok(title < claim);
  assert.equal((hop.match(/data-later-fact=""/g) ?? []).length, 3);
  assert.equal((hop.match(/class="bid later-fact"/g) ?? []).length, 1);
  assert.equal((hop.match(/class="clicks later-fact"/g) ?? []).length, 1);
  assert.equal((hop.match(/class="opening-facts later-fact"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-prize-before-price=""/g) ?? []).length, 1);
  assert.equal((hop.match(/data-prize=""/g) ?? []).length, 1);
  assert.match(hop, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(hop, /class="opening-facts later-fact"/);
  assert.match(hop, /class="bid later-fact"/);
  assert.match(hop, /class="clicks later-fact"/);
  assert.match(hop, /data-later-fact=""/);
  assert.match(hop, /\$12/);
  assert.match(hop, /4 clicks/);
  assert.match(hop, /data-hear-opening="hop"/);
  assert.match(hop, /data-real-playback="hop"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, FORBIDDEN);
  assert.doesNotMatch(
    hop.slice(laterTitle),
    /data-later-fact|later-fact|data-prize-before-price|data-prize=/,
  );

  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const embedPrize = embed.indexOf('data-prize=""');
  const embedTitle = embed.indexOf(">Cold Open<", embedPrize);
  const embedHear = embed.indexOf('data-hear-opening="embed"');
  const embedFacts = embed.indexOf('class="opening-facts later-fact"');
  const embedLater = embed.indexOf('data-later-fact=""', embedFacts);
  const embedBidClass = embed.indexOf('class="bid later-fact"');
  const embedClicksClass = embed.indexOf('class="clicks later-fact"');
  assert.notEqual(embedPrize, -1);
  assert.notEqual(embedTitle, -1);
  assert.notEqual(embedHear, -1);
  assert.notEqual(embedFacts, -1);
  assert.notEqual(embedLater, -1);
  assert.notEqual(embedBidClass, -1);
  assert.notEqual(embedClicksClass, -1);
  assert.ok(embed.indexOf('data-prize-before-price=""') < embedPrize);
  assert.ok(embedPrize < embedTitle);
  assert.ok(embedTitle < embedHear);
  assert.ok(embedHear < embedFacts);
  assert.ok(embedFacts < embedLater);
  assert.ok(embedLater < embedBidClass);
  assert.ok(embedClicksClass > embedBidClass);
  assert.equal((embed.match(/data-later-fact=""/g) ?? []).length, 3);
  assert.equal((embed.match(/class="bid later-fact"/g) ?? []).length, 1);
  assert.equal((embed.match(/class="clicks later-fact"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-prize-before-price=""/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /data-real-playback="embed"/);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.match(pageSource, /className="opening-facts later-fact"/);
  assert.match(pageSource, /className="bid later-fact"/);
  assert.match(pageSource, /className="clicks later-fact"/);
  assert.match(pageSource, /data-later-fact=/);
  assert.match(pageSource, /data-prize-before-price=/);
  assert.match(pageSource, /data-prize=/);
  assert.match(pageSource, /station-desk/);
  assert.match(pageSource, /claim-rail/);
  assert.match(pageSource, /data-empty-bid-five/);
  assert.match(pageSource, /data-real-playback=/);
  assert.doesNotMatch(pageSource, /data-hear-after-need-six/);
  assert.doesNotMatch(pageSource, /data-need-after-hear-six/);
});

test("occupied Hear is the first click — Need $N is not a muted twin", () => {
  const hearSize = cssSource.match(
    /\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four\.hear-after-need-five \{\n  min-height: 3\.95rem;[\s\S]*?\n  font-size: ([\d.]+)rem/,
  );
  const needSize = cssSource.match(
    /\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four\.need-after-hear-five \{\n  min-height: 3\.35rem;[\s\S]*?\n  font-size: ([\d.]+)rem/,
  );
  const prizeSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track\s*\{[^}]*font-size:\s*clamp\(([\d.]+)rem/,
  );
  const laterBidSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.bid\s*\{[^}]*font-size:\s*([\d.]+)rem/,
  );
  const groupedNeed = cssSource.match(
    /\.week-occupied \.claim-rail \.raise-after-hear \{\n[\s\S]*?\n\}/,
  );
  const needHopRule = cssSource.match(/\.week-occupied \.need-after-hear \{[^}]+\}/);
  assert.ok(hearSize);
  assert.ok(needSize);
  assert.ok(prizeSize);
  assert.ok(laterBidSize);
  assert.ok(groupedNeed);
  assert.ok(needHopRule);
  assert.ok(Number(hearSize[1]) > Number(needSize[1]));
  assert.ok(Number(prizeSize[1]) > Number(laterBidSize[1]));
  assert.match(groupedNeed[0], /margin: 0 0 0\.85rem/);
  assert.doesNotMatch(groupedNeed[0], /background:/);
  assert.doesNotMatch(groupedNeed[0], /color: var\(--muted\)/);
  assert.doesNotMatch(groupedNeed[0], /font-size:/);
  assert.match(needHopRule[0], /border: 2px dashed/);
  assert.match(needHopRule[0], /background: transparent/);
  assert.doesNotMatch(needHopRule[0], /color: var\(--muted\)/);
  assert.doesNotMatch(cssSource, /data-need-later-quiet/);
  assert.doesNotMatch(cssSource, /need-later-quiet/);

  const empty = renderBoard([]);
  assert.match(empty, /class="board station week-empty"/);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /No opening song/);
  assert.doesNotMatch(empty, /data-need-later-quiet/);
  assert.doesNotMatch(empty, /need-later-quiet/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /data-raise-after-hear/);
  assert.doesNotMatch(empty, /class="raise-after-hear"/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearCopy = hop.indexOf("Hear last 7 days");
  const hearHop = hop.indexOf('data-hear-opening="hop"');
  const prize = hop.indexOf('data-prize=""');
  const title = hop.indexOf(">Cold Open<", prize);
  const laterBid = hop.indexOf('class="bid later-fact"');
  const rail = hop.indexOf('class="claim-rail"');
  const needGroup = hop.indexOf('class="raise-after-hear"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const difference = hop.indexOf("Same listen URL pays only the difference");
  const claim = hop.indexOf('id="claim"');
  const laterCard = hop.indexOf('data-id="lst_two"');
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearCopy, -1);
  assert.notEqual(hearHop, -1);
  assert.notEqual(prize, -1);
  assert.notEqual(title, -1);
  assert.notEqual(laterBid, -1);
  assert.notEqual(rail, -1);
  assert.notEqual(needGroup, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(difference, -1);
  assert.notEqual(claim, -1);
  assert.notEqual(laterCard, -1);
  assert.ok(firstRead < firstClick);
  assert.ok(firstClick < hearCopy);
  assert.ok(hearCopy < rail);
  assert.ok(hearHop < rail);
  assert.ok(title < laterBid);
  assert.ok(rail < needGroup);
  assert.ok(needGroup < needCopy);
  assert.ok(needCopy < difference);
  assert.ok(needGroup < claim);
  assert.ok(claim < laterCard);
  assert.equal((hop.match(/class="raise-after-hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    hop,
    /class="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"/,
  );
  assert.match(
    hop,
    /class="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"/,
  );
  assert.match(hop, /data-first-click="hear"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(hop, /class="bid later-fact"/);
  assert.match(hop, /\$12/);
  assert.match(hop, /4 clicks/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.match(hop, /class="claim-rail"/);
  assert.match(hop, /class="board station week-occupied"/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /class="board station week-empty"/);
  assert.doesNotMatch(hop, /data-empty-bid-five/);
  assert.doesNotMatch(hop, /data-need-later-quiet/);
  assert.doesNotMatch(hop, /need-later-quiet/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, FORBIDDEN);
  assert.doesNotMatch(hop.slice(laterCard), /Need \$|raise-after-hear|need-after-hear/);

  const hearSlice = hop.slice(firstClick, rail);
  const needSlice = hop.slice(rail, claim);
  assert.match(hearSlice, /Hear last 7 days/);
  assert.doesNotMatch(hearSlice, /Need \$13 to take #1/);
  assert.doesNotMatch(hearSlice, /class="raise-after-hear"/);
  assert.match(needSlice, /Need \$13 to take #1/);
  assert.match(needSlice, /class="raise-after-hear"/);
  assert.doesNotMatch(needSlice, /Hear last 7 days/);

  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  const embedHearClick = embed.indexOf('data-first-click="hear"');
  const embedPlayer = embed.indexOf('data-hear-opening="embed"');
  const embedRail = embed.indexOf('class="claim-rail"');
  const embedNeed = embed.indexOf('class="raise-after-hear"');
  const embedClaim = embed.indexOf('id="claim"');
  assert.notEqual(embedHearClick, -1);
  assert.notEqual(embedPlayer, -1);
  assert.notEqual(embedRail, -1);
  assert.notEqual(embedNeed, -1);
  assert.notEqual(embedClaim, -1);
  assert.ok(embedHearClick < embedPlayer);
  assert.ok(embedPlayer < embedRail);
  assert.ok(embedRail < embedNeed);
  assert.ok(embedNeed < embedClaim);
  assert.match(embed, /href="#hear-opening"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.equal((embed.match(/class="raise-after-hear"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, /data-need-later-quiet/);
  assert.doesNotMatch(embed, /Not bidding\?/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.match(pageSource, /className="claim-rail"/);
  assert.match(pageSource, /className="raise-after-hear"/);
  assert.match(pageSource, /data-first-click="hear"/);
  assert.match(pageSource, /station-desk/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /className="amount-field"/);
  assert.match(formSource, /Outbid/);
  assert.doesNotMatch(pageSource, /data-need-later-quiet/);
  assert.doesNotMatch(pageSource, /need-later-quiet/);
  assert.doesNotMatch(pageSource, /data-hear-after-need-six/);
  assert.doesNotMatch(pageSource, /data-need-after-hear-six/);
});

test("empty week has one first click — Claim #1, then the listen URL", () => {
  assert.match(
    cssSource,
    /Empty week: Listen URL is a later write after Claim #1 \/ Outbid/,
  );
  assert.match(
    cssSource,
    /\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.listen-identity\[data-later-write\]/,
  );
  assert.match(
    cssSource,
    /\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.later-write-label/,
  );
  assert.match(
    cssSource,
    /\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.outbid\[data-first-click="claim"\]/,
  );
  const later =
    (cssSource.split(
      "Empty week: Listen URL is a later write after Claim #1 / Outbid",
      2,
    )[1] ?? "").split("End empty-week later-write")[0] ?? "";
  assert.match(later, /border-top:\s*1px dashed var\(--line\)/);
  assert.match(later, /color:\s*var\(--muted\)/);
  assert.doesNotMatch(later, /background:/);
  assert.doesNotMatch(later, /var\(--primary\)/);
  assert.doesNotMatch(later, /hear-after-need-six|need-after-hear-six/);
  assert.match(cssSource, /\.week-occupied \.claim \.listen-identity\[data-later-write\]/);
  assert.match(cssSource, /\.week-occupied \.claim \[data-first-click="claim"\]/);

  const emptyFn =
    formSource.split("function EmptyClaimFirstWrite")[1]?.split(
      "export function BidForm",
    )[0] ?? "";
  const occupiedFn =
    formSource.split("function OccupiedListingWrite")[1]?.split(
      "function EmptyClaimFirstWrite",
    )[0] ?? "";
  const emptyOutbid = emptyFn.indexOf("Outbid");
  const emptyLater = emptyFn.indexOf("data-later-write");
  const emptyUrl = emptyFn.indexOf("ListingIdentityFields");
  const occupiedFields = occupiedFn.indexOf("ListingIdentityFields");
  const occupiedFnOutbid = occupiedFn.indexOf("Outbid");
  assert.ok(emptyOutbid >= 0 && emptyLater > emptyOutbid);
  assert.ok(emptyUrl > emptyLater);
  assert.ok(occupiedFields >= 0 && occupiedFnOutbid > occupiedFields);
  assert.match(emptyFn, /data-first-click="claim"/);
  assert.match(emptyFn, /Then the listen URL/);
  assert.doesNotMatch(occupiedFn, /data-first-click="claim"/);
  assert.doesNotMatch(occupiedFn, /Then the listen URL/);
  assert.doesNotMatch(occupiedFn, /data-later-write/);
  assert.doesNotMatch(formSource, /hear-after-need-six|need-after-hear-six/);

  const empty = renderBoard([]);
  const bidRead = empty.indexOf('data-first-read="bid"');
  const bidCopy = empty.indexOf("Bid USD");
  const claimAt = empty.indexOf('id="claim"');
  const emptyClaimAt = empty.indexOf('data-empty-claim-first=""');
  const claimCopyAt = empty.indexOf("Claim #1 for");
  const firstClickAt = empty.indexOf('data-first-click="claim"');
  const outbidAt = empty.indexOf(">Outbid<");
  const laterWriteAt = empty.indexOf('data-later-write=""');
  const laterLabelAt = empty.indexOf("Then the listen URL");
  const identityAt = empty.indexOf('data-listen-identity=""');
  const trackAt = empty.indexOf('name="track"');
  const artistAt = empty.indexOf('name="artist"');
  const listenAt = empty.indexOf('name="listenUrl"');
  const emptyDeck = empty.indexOf("No opening song");
  const fiveCopy = empty.indexOf("$5 claims last 7 days");
  assert.ok(bidRead >= 0 && bidCopy >= bidRead);
  assert.ok(claimAt >= 0 && emptyClaimAt > claimAt);
  assert.ok(claimCopyAt > emptyClaimAt && firstClickAt > claimCopyAt);
  assert.ok(outbidAt > firstClickAt);
  assert.ok(laterWriteAt > outbidAt && laterLabelAt > laterWriteAt);
  assert.ok(identityAt > outbidAt && identityAt <= laterWriteAt);
  assert.ok(trackAt > laterLabelAt && artistAt > trackAt);
  assert.ok(listenAt > artistAt);
  assert.ok(emptyDeck >= 0 && emptyDeck < claimAt);
  assert.ok(fiveCopy > claimAt);
  assert.ok(bidCopy < claimAt);
  assert.match(empty, /class="claim empty-claim-first"/);
  assert.match(empty, /data-empty-claim-first=""/);
  assert.match(empty, /aria-label="Claim #1"/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /data-listen-identity=""/);
  assert.match(empty, /data-later-write=""/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, /name="track"/);
  assert.match(empty, /name="artist"/);
  assert.match(empty, /name="listenUrl"/);
  assert.match(empty, /name="amountUsd"/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /class="board station week-empty"/);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /No opening song/);
  assert.match(empty, /Nobody has paid yet/);
  assert.match(empty, /There is no player last 7 days/);
  assert.match(empty, /class="station-desk"/);
  assert.match(empty, /claim-rail/);
  assert.match(empty, /class="amount-field"/);
  assert.match(empty, /class="step"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /data-raise-after-hear/);
  assert.doesNotMatch(empty, /class="raise-after-hear"/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.doesNotMatch(empty, /data-prize-before-price/);
  assert.doesNotMatch(empty, /data-need-later-quiet/);
  assert.doesNotMatch(empty, /need-later-quiet/);
  assert.doesNotMatch(empty, /class="station-desk hear-first"/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-later-write=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-listen-identity=""/g) ?? []).length, 1);
  assert.doesNotMatch(empty, FORBIDDEN);

  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
  ]);
  const hearClick = hop.indexOf('data-first-click="hear"');
  const prize = hop.indexOf('data-prize=""');
  const title = hop.indexOf(">Cold Open<", prize);
  const rail = hop.indexOf('class="claim-rail"');
  const needGroup = hop.indexOf('class="raise-after-hear"');
  const needCopy = hop.indexOf("Need $13 to take #1");
  const occupiedClaim = hop.indexOf("Claim #1 for");
  const occupiedTrack = hop.indexOf('name="track"');
  const occupiedListen = hop.indexOf('name="listenUrl"');
  const occupiedOutbid = hop.indexOf(">Outbid<");
  assert.notEqual(hearClick, -1);
  assert.notEqual(prize, -1);
  assert.notEqual(title, -1);
  assert.notEqual(rail, -1);
  assert.notEqual(needGroup, -1);
  assert.notEqual(needCopy, -1);
  assert.notEqual(occupiedClaim, -1);
  assert.notEqual(occupiedTrack, -1);
  assert.notEqual(occupiedListen, -1);
  assert.notEqual(occupiedOutbid, -1);
  assert.ok(hearClick < rail);
  assert.ok(rail < needGroup);
  assert.ok(needGroup < needCopy);
  assert.ok(needCopy < occupiedClaim);
  assert.ok(occupiedTrack > occupiedClaim);
  assert.ok(occupiedListen > occupiedTrack);
  assert.ok(occupiedOutbid > occupiedListen);
  assert.match(hop, /data-first-click="hear"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(hop, /class="bid later-fact"/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.match(hop, /class="claim-rail"/);
  assert.match(hop, /name="track"/);
  assert.match(hop, /name="listenUrl"/);
  assert.doesNotMatch(hop, /data-empty-claim-first/);
  assert.doesNotMatch(hop, /class="claim empty-claim-first"/);
  assert.doesNotMatch(hop, /data-first-click="claim"/);
  assert.doesNotMatch(hop, /Then the listen URL/);
  assert.doesNotMatch(hop, /data-listen-identity/);
  assert.doesNotMatch(hop, /data-later-write/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  assert.match(embed, /data-first-click="hear"/);
  assert.match(embed, /href="#hear-opening"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /data-prize=""/);
  assert.doesNotMatch(embed, /data-empty-claim-first/);
  assert.doesNotMatch(embed, /data-first-click="claim"/);
  assert.doesNotMatch(embed, /Then the listen URL/);
  assert.doesNotMatch(embed, /data-later-write/);
  assert.doesNotMatch(embed, FORBIDDEN);

  const claimFirstRule = cssSource.match(
    /^\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.outbid\[data-first-click="claim"\] \{\n[\s\S]*?\n\}/m,
  );
  const laterWriteRule = cssSource.match(
    /^\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.listen-identity\[data-later-write\] \{\n[\s\S]*?\n\}/m,
  );
  const laterLabelRule = cssSource.match(
    /^\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.later-write-label \{\n[\s\S]*?\n\}/m,
  );
  const occupiedNeedGroup = cssSource.match(
    /\.week-occupied \.claim-rail \.raise-after-hear \{\n[\s\S]*?\n\}/,
  );
  assert.ok(claimFirstRule);
  assert.ok(laterWriteRule);
  assert.ok(laterLabelRule);
  assert.ok(occupiedNeedGroup);
  assert.match(claimFirstRule[0], /min-height: 2\.75rem/);
  assert.doesNotMatch(claimFirstRule[0], /background:/);
  assert.match(laterWriteRule[0], /border-top: 1px dashed var\(--line\)/);
  assert.doesNotMatch(laterWriteRule[0], /background:/);
  assert.match(laterLabelRule[0], /color: var\(--muted\)/);
  assert.doesNotMatch(laterLabelRule[0], /background:/);
  assert.match(occupiedNeedGroup[0], /margin: 0 0 0\.85rem/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);

  assert.match(pageSource, /data-first-click="hear"/);
  assert.match(pageSource, /className="raise-after-hear"/);
  assert.match(pageSource, /station-desk/);
  assert.match(pageSource, /claim-rail/);
  assert.match(formSource, /empty-claim-first/);
  assert.match(formSource, /data-empty-claim-first=/);
  assert.match(formSource, /data-first-click="claim"/);
  assert.match(formSource, /Then the listen URL/);
  assert.match(formSource, /data-later-write=/);
  assert.match(formSource, /data-listen-identity=/);
  assert.match(formSource, /EmptyClaimFirstWrite/);
  assert.match(formSource, /OccupiedListingWrite/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /className="amount-field"/);
  assert.match(formSource, /−/);
  assert.match(formSource, /\+/);
  assert.match(formSource, /Outbid/);
  assert.match(formSource, /name="listenUrl"/);
  assert.doesNotMatch(pageSource, /data-hear-after-need-six/);
  assert.doesNotMatch(pageSource, /data-need-after-hear-six/);
  assert.doesNotMatch(formSource, /data-hear-after-need-six/);
  assert.doesNotMatch(formSource, /data-need-after-hear-six/);
  assert.doesNotMatch(formSource, /data-need-later-quiet/);
});

test("occupied later tracks stay quieter than the opening song — prize stays first", () => {
  const prizeSize = cssSource.match(
    /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track\s*\{[^}]*font-size:\s*clamp\(([\d.]+)rem/,
  );
  const laterTrackRule = cssSource.match(
    /\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\] \.later-track\[data-later-track\]\s*\{[^}]+\}/,
  );
  const laterTrackSize = laterTrackRule?.[0].match(/font-size:\s*([\d.]+)rem/);
  const laterListenRule = cssSource.match(
    /\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\] \.listen\.later-listen\[data-listen-later\]\s*\{[^}]+\}/,
  );
  const laterCardRule = cssSource.match(
    /\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\]\s*\{[^}]+\}/,
  );
  const laterRankRule = cssSource.match(
    /\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\] \.rank\s*\{[^}]+\}/,
  );
  const hearRule = cssSource.match(/\.week-occupied \.opening-listen \{[^}]+\}/);
  assert.ok(prizeSize);
  assert.ok(laterTrackRule);
  assert.ok(laterTrackSize);
  assert.ok(laterListenRule);
  assert.ok(laterCardRule);
  assert.ok(laterRankRule);
  assert.ok(hearRule);
  assert.ok(Number(prizeSize[1]) > Number(laterTrackSize[1]));
  assert.match(laterTrackRule[0], /font-size:\s*0\.92rem/);
  assert.match(laterTrackRule[0], /font-family:\s*var\(--sans\)/);
  assert.match(laterTrackRule[0], /font-weight:\s*500/);
  assert.doesNotMatch(laterTrackRule[0], /background:/);
  assert.doesNotMatch(laterTrackRule[0], /var\(--primary\)/);
  assert.doesNotMatch(laterTrackRule[0], /0\.78rem/);
  assert.match(laterListenRule[0], /font-size:\s*0\.68rem/);
  assert.doesNotMatch(laterListenRule[0], /background:/);
  assert.match(laterCardRule[0], /border-top:\s*1px dashed var\(--line\)/);
  assert.match(laterCardRule[0], /min-height:\s*0/);
  assert.match(laterCardRule[0], /box-shadow:\s*none/);
  assert.doesNotMatch(laterCardRule[0], /background:\s*var\(--/);
  assert.match(laterRankRule[0], /background:\s*transparent/);
  assert.match(laterRankRule[0], /font-size:\s*0\.72rem/);
  assert.match(hearRule[0], /background:\s*var\(--ink\)/);
  assert.match(cssSource, /clamp\(2\.85rem, 8vw, 4\.4rem\)/);
  assert.match(
    cssSource,
    /\.week-occupied \.queue\.later-stack\[data-later-stack\]/,
  );
  assert.match(cssSource, /\.board\[data-empty-bid-five\] \[data-later-rank\]/);
  assert.match(cssSource, /\.week-empty \[data-later-track\]/);
  assert.doesNotMatch(cssSource, /data-later-rank-quiet|data-later-quiet/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /\.card-cue/);
  assert.doesNotMatch(cssSource, /^\.track \{/m);

  const empty = renderBoard([]);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, /No opening song/);
  assert.doesNotMatch(empty, /data-later-stack/);
  assert.doesNotMatch(empty, /data-later-rank/);
  assert.doesNotMatch(empty, /data-later-track/);
  assert.doesNotMatch(empty, /data-listen-later/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const hop = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
    listing({
      id: "lst_three",
      track: "Third Slot",
      artist: "Cyd",
      listenUrl: "https://example.com/third-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-19T00:00:00.000Z",
    }),
  ]);
  const firstRead = hop.indexOf('data-first-read="hear"');
  const firstClick = hop.indexOf('data-first-click="hear"');
  const hearCopy = hop.indexOf("Hear last 7 days");
  const prize = hop.indexOf('data-prize=""');
  const title = hop.indexOf(">Cold Open<", prize);
  const laterBid = hop.indexOf('class="bid later-fact"');
  const rail = hop.indexOf('class="claim-rail"');
  const needGroup = hop.indexOf('class="raise-after-hear"');
  const claim = hop.indexOf('id="claim"');
  const stack = hop.indexOf('data-later-stack=""');
  const laterCard = hop.indexOf('data-id="lst_two"');
  const laterTrack = hop.indexOf(
    '<p class="later-track" data-later-track="">Second Slot</p>',
  );
  const laterListen = hop.indexOf('data-listen-later=""');
  const laterHref = hop.indexOf('href="/click/lst_two"');
  const thirdCard = hop.indexOf('data-id="lst_three"');
  const thirdTrack = hop.indexOf(
    '<p class="later-track" data-later-track="">Third Slot</p>',
  );
  assert.notEqual(firstRead, -1);
  assert.notEqual(firstClick, -1);
  assert.notEqual(hearCopy, -1);
  assert.notEqual(prize, -1);
  assert.notEqual(title, -1);
  assert.notEqual(laterBid, -1);
  assert.notEqual(rail, -1);
  assert.notEqual(needGroup, -1);
  assert.notEqual(claim, -1);
  assert.notEqual(stack, -1);
  assert.notEqual(laterCard, -1);
  assert.notEqual(laterTrack, -1);
  assert.notEqual(laterListen, -1);
  assert.notEqual(laterHref, -1);
  assert.notEqual(thirdCard, -1);
  assert.notEqual(thirdTrack, -1);
  assert.ok(firstRead < firstClick);
  assert.ok(firstClick < rail);
  assert.ok(title < laterBid);
  assert.ok(firstClick < rail);
  assert.ok(rail < needGroup);
  assert.ok(needGroup < claim);
  assert.ok(claim < stack);
  assert.ok(stack < laterCard);
  assert.ok(laterCard < laterTrack);
  assert.ok(laterTrack < laterListen);
  assert.ok(laterListen < laterHref || laterHref < laterListen);
  assert.ok(laterTrack < thirdTrack);
  assert.equal((hop.match(/data-later-stack=""/g) ?? []).length, 1);
  assert.equal((hop.match(/data-later-rank=""/g) ?? []).length, 2);
  assert.equal((hop.match(/data-later-track=""/g) ?? []).length, 2);
  assert.equal((hop.match(/data-listen-later=""/g) ?? []).length, 2);
  assert.equal((hop.match(/data-prize=""/g) ?? []).length, 1);
  assert.equal((hop.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.match(hop, /class="queue later-stack"/);
  assert.match(hop, /class="card later-card"/);
  assert.match(hop, /class="leaderboard later-board"/);
  assert.match(hop, /Also last 7 days/);
  assert.match(hop, /These tracks are not the opening song/);
  assert.match(
    hop,
    /<p class="later-track" data-later-track="">Second Slot<\/p>/,
  );
  assert.match(hop, /<p class="later-track" data-later-track="">Third Slot<\/p>/);
  assert.match(hop, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(hop, /data-first-click="hear"/);
  assert.match(hop, /Hear last 7 days/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /class="raise-after-hear"/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  assert.match(hop, /class="bid later-fact"/);
  assert.match(hop, /\$12/);
  assert.match(hop, /\$5/);
  assert.doesNotMatch(hop, /<h3 class="track">/);
  assert.doesNotMatch(hop, /card-cue/);
  assert.doesNotMatch(hop, /Cue [0-9]/);
  assert.doesNotMatch(hop, /data-later-rank-quiet/);
  assert.doesNotMatch(hop, /data-later-quiet/);
  assert.doesNotMatch(hop, /data-need-later-quiet/);
  assert.doesNotMatch(hop, /class="station-desk hear-first"/);
  assert.doesNotMatch(hop, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(hop, /Not bidding\?/);
  assert.doesNotMatch(hop, FORBIDDEN);
  assert.doesNotMatch(
    hop.slice(laterCard),
    /data-prize=|data-prize-before-price|opening-track|data-first-click="hear"|Hear last 7 days|Need \$|raise-after-hear/,
  );
  assert.doesNotMatch(hop.slice(0, stack), /data-later-rank|later-track|data-listen-later/);

  const laterSlice = hop.slice(laterCard, thirdCard);
  assert.match(laterSlice, /data-later-rank=""/);
  assert.match(laterSlice, /later-track/);
  assert.match(laterSlice, /Listen/);
  assert.match(laterSlice, /data-listen-later=""/);
  assert.doesNotMatch(laterSlice, /data-prize=/);
  assert.doesNotMatch(laterSlice, /opening-track/);
  assert.doesNotMatch(laterSlice, /data-first-click="hear"/);
  assert.doesNotMatch(laterSlice, /Hear last 7 days/);

  const solo = renderBoard([
    listing({
      id: "lst_only",
      track: "Only Open",
      listenUrl: "https://example.com/only-open",
    }),
  ]);
  assert.match(solo, /data-opening-song="true"/);
  assert.match(solo, /<h1 class="opening-track" data-prize="">Only Open<\/h1>/);
  assert.match(solo, /data-first-click="hear"/);
  assert.doesNotMatch(solo, /data-later-stack/);
  assert.doesNotMatch(solo, /data-later-rank/);
  assert.doesNotMatch(solo, /data-later-track/);
  assert.doesNotMatch(solo, /data-leaderboard/);
  assert.doesNotMatch(solo, /Also last 7 days/);
  assert.doesNotMatch(solo, FORBIDDEN);

  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  const embedHear = embed.indexOf('data-first-click="hear"');
  const embedPrize = embed.indexOf('data-prize=""');
  const embedStack = embed.indexOf('data-later-stack=""');
  const embedLater = embed.indexOf('data-later-rank=""');
  assert.ok(embedHear >= 0 && embedHear < embedPrize);
  assert.ok(embedPrize < embedStack);
  assert.ok(embedStack < embedLater);
  assert.match(embed, /href="#hear-opening"/);
  assert.match(embed, /data-hear-opening="embed"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(
    embed,
    /<p class="later-track" data-later-track="">Second Slot<\/p>/,
  );
  assert.doesNotMatch(embed, /<h3 class="track">/);
  assert.doesNotMatch(embed, /data-later-quiet/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.match(pageSource, /data-later-stack/);
  assert.match(pageSource, /data-later-rank/);
  assert.match(pageSource, /data-later-track/);
  assert.match(pageSource, /later-listen/);
  assert.match(pageSource, /data-listen-later/);
  assert.match(pageSource, /className="card later-card"/);
  assert.match(pageSource, /className="queue later-stack"/);
  assert.match(pageSource, /data-prize=/);
  assert.match(pageSource, /data-first-click="hear"/);
  assert.match(pageSource, /className="raise-after-hear"/);
  assert.match(pageSource, /station-desk/);
  assert.match(pageSource, /claim-rail/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /Outbid/);
  assert.match(formSource, /data-first-click="claim"/);
  assert.doesNotMatch(pageSource, /data-later-rank-quiet/);
  assert.doesNotMatch(pageSource, /data-later-quiet/);
  assert.doesNotMatch(pageSource, /data-hear-after-need-six/);
  assert.doesNotMatch(pageSource, /data-need-after-hear-six/);
  assert.doesNotMatch(pageSource, /className="track"/);
  assert.doesNotMatch(pageSource, /card-cue/);
});

test("unpaid stays off the station desk — No #1 until Polar reports paid", () => {
  assert.match(pageSource, /isPolarPaidListing/);
  assert.match(
    pageSource,
    /data-unpaid-off=\{emptyWeek && leftoverUnpaid \? "" : undefined\}/,
  );
  assert.match(
    pageSource,
    /An unpaid Polar checkout stays off this desk until Polar reports paid/,
  );
  assert.match(formSource, /data-unpaid-off=\{unpaidOff \? "" : undefined\}/);
  assert.match(
    formSource,
    /Unpaid Polar checkout stays off this desk until Polar reports paid/,
  );
  assert.match(formSource, /An abandoned track is not #1/);
  assert.match(cssSource, /\.claim-note\[data-unpaid-off\]/);
  assert.match(cssSource, /\.board\[data-unpaid-off\] \[data-prize\]/);
  assert.match(cssSource, /\.board\[data-unpaid-off\] \.opening-listen/);
  assert.match(cssSource, /\.board\[data-unpaid-off\] \[data-hear-opening\]/);
  assert.match(cssSource, /\.board\[data-unpaid-off\] \.later-stack/);
  assert.match(cssSource, /\.week-empty\[data-unpaid-off\] \[data-prize\]/);
  assert.match(cssSource, /\.week-empty\[data-unpaid-off\] \.later-stack/);
  const unpaidHide =
    cssSource.match(/\.board\[data-unpaid-off\] \.hear-after-raise,[\s\S]*?display: none;/)?.[0] ??
    "";
  assert.match(unpaidHide, /display:\s*none/);
  assert.match(unpaidHide, /data-prize/);
  assert.match(unpaidHide, /opening-listen/);
  assert.match(unpaidHide, /later-stack/);
  assert.doesNotMatch(unpaidHide, /background:/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(pageSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(formSource, /hear-after-need-six|need-after-hear-six/);
  assert.match(pageSource, /data-prize=/);
  assert.match(pageSource, /data-first-click="hear"/);
  assert.match(pageSource, /Hear last 7 days/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(formSource, /empty-claim-first/);
  assert.match(formSource, /data-first-click="claim"/);
  assert.match(formSource, /Then the listen URL/);
  assert.match(pageSource, /className="queue later-stack"/);
  assert.match(pageSource, /station-desk/);
  assert.match(formSource, /className="amount-field"/);
  assert.match(formSource, /Outbid/);

  const unpaidDraft = listing({
    id: "lst_ghost",
    track: "Ghost Track",
    artist: "Vapor",
    listenUrl: "https://example.com/ghost",
    bidUsd: 99,
    firstPaidAt: "",
  });
  const rankedUnpaid = rankListings([unpaidDraft]);
  assert.deepEqual(rankedUnpaid, []);
  const unpaidCard = renderToStaticMarkup(
    createElement(ListingCard, {
      listing: { ...unpaidDraft, rank: 1 },
    }),
  );
  assert.equal(unpaidCard, "");

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: rankedUnpaid,
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  const emptyStamp = leftover.indexOf("No opening song");
  const claimAt = leftover.indexOf('id="claim"');
  const unpaidNote = leftover.indexOf("Unpaid Polar checkout stays off this desk");
  const abandonedNote = leftover.indexOf("An abandoned track is not #1");
  const firstClickClaim = leftover.indexOf('data-first-click="claim"');
  const laterUrl = leftover.indexOf("Then the listen URL");
  const outbidAt = leftover.indexOf(">Outbid<");
  assert.ok(emptyStamp >= 0 && claimAt > emptyStamp);
  assert.ok(unpaidNote > claimAt && abandonedNote > unpaidNote);
  assert.ok(firstClickClaim > claimAt && firstClickClaim < laterUrl);
  assert.ok(outbidAt > firstClickClaim && laterUrl > outbidAt);
  assert.match(leftover, /class="board station week-empty"/);
  assert.match(leftover, /data-empty-bid-five=""/);
  assert.match(leftover, /data-unpaid-off=""/);
  assert.match(leftover, /data-empty-week="true"/);
  assert.match(leftover, /data-opening-song="false"/);
  assert.match(leftover, /No opening song/);
  assert.match(leftover, /until Polar reports paid/);
  assert.match(leftover, /Bid USD/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /data-first-click="claim"/);
  assert.match(leftover, /Then the listen URL/);
  assert.match(leftover, />Outbid</);
  assert.match(leftover, /class="amount-field"/);
  assert.match(leftover, /class="station-desk"/);
  assert.doesNotMatch(leftover, /data-listing-card/);
  assert.doesNotMatch(leftover, /Ghost Track/);
  assert.doesNotMatch(leftover, /Vapor/);
  assert.doesNotMatch(leftover, /\$99/);
  assert.doesNotMatch(leftover, /data-prize=/);
  assert.doesNotMatch(leftover, /prize-before-price/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /data-first-click="hear"/);
  assert.doesNotMatch(leftover, /Need \$/);
  assert.doesNotMatch(leftover, /data-later-stack/);
  assert.doesNotMatch(leftover, /data-later-rank/);
  assert.doesNotMatch(leftover, /LIVE OPEN/);
  assert.doesNotMatch(leftover, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(leftover, /class="station-desk hear-first"/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  const empty = renderBoard([]);
  assert.match(empty, /No opening song/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.doesNotMatch(empty, /data-unpaid-off=/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.doesNotMatch(empty, /data-later-stack/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      clicks: 4,
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  const occupiedClaim = occupied.indexOf('id="claim"');
  const occupiedHear = occupied.indexOf('data-first-click="hear"');
  const occupiedPrize = occupied.indexOf('data-prize=""');
  const occupiedUnpaid = occupied.indexOf("Unpaid Polar checkout stays off this desk");
  assert.ok(occupiedHear >= 0 && occupiedHear < occupiedPrize);
  assert.ok(occupiedPrize < occupiedClaim);
  assert.ok(occupiedUnpaid > occupiedClaim);
  assert.match(occupied, /class="board station week-occupied"/);
  assert.match(occupied, /data-prize=""/);
  assert.match(occupied, /Hear last 7 days/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /class="raise-after-hear"/);
  assert.match(occupied, /class="queue later-stack"/);
  assert.match(occupied, /data-later-rank=""/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, />Outbid</);
  assert.match(occupied, /Unpaid Polar checkout stays off this desk/);
  assert.match(occupied, /An abandoned track is not #1/);
  assert.match(occupied, /data-unpaid-off=""/);
  assert.doesNotMatch(occupied, /data-empty-week/);
  assert.doesNotMatch(occupied, /data-empty-bid-five/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /Then the listen URL/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-prize=""/g) ?? []).length, 1);

  const leaked = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [
        { ...unpaidDraft, rank: 1 },
        {
          ...listing({
            id: "lst_paid_only",
            track: "Cold Open",
            artist: "Ada",
            listenUrl: "https://example.com/cold-open",
            bidUsd: 5,
          }),
          rank: 2,
        },
      ],
    }),
  );
  assert.match(leaked, /data-opening-song="true"/);
  assert.match(leaked, /<h1 class="opening-track" data-prize="">Cold Open<\/h1>/);
  assert.match(leaked, /data-id="lst_paid_only"/);
  assert.match(leaked, /data-rank="1"/);
  assert.match(leaked, /data-first-click="hear"/);
  assert.match(leaked, /Hear last 7 days/);
  assert.equal((leaked.match(/data-listing-card/g) ?? []).length, 1);
  assert.doesNotMatch(leaked, /Ghost Track|Vapor|lst_ghost/);
  assert.doesNotMatch(leaked, /data-empty-week/);
  assert.doesNotMatch(leaked, /data-first-click="claim"/);
  assert.doesNotMatch(leaked, /data-rank="2"/);
  assert.doesNotMatch(leaked, FORBIDDEN);
});

test("occupied week window is rolling last-7-days — not Monday 00:00 UTC", () => {
  const empty = renderBoard([]);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-opening-song="false"/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, /No opening song/);
  assert.match(empty, /class="period-meta"/);
  assert.match(empty, /data-empty-window=""/);
  assert.match(empty, /Last 7 days from a paid open/);
  assert.match(empty, /Not Monday midnight UTC/);
  assert.doesNotMatch(empty, /Next reset/);
  assert.doesNotMatch(empty, /data-rolling-week/);
  assert.doesNotMatch(empty, /Rolling last 7 days/);
  assert.doesNotMatch(empty, /class="period-meta week-window"/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.doesNotMatch(empty, /24h lock/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  const prizeAt = occupied.indexOf(
    '<h1 class="opening-track" data-prize="">Cold Open</h1>',
  );
  const firstClickAt = occupied.indexOf('data-first-click="hear"');
  const windowAt = occupied.indexOf('data-rolling-week=""');
  const laterAt = occupied.indexOf('data-later-stack=""');
  const claimAt = occupied.indexOf('id="claim"');
  assert.notEqual(prizeAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.notEqual(windowAt, -1);
  assert.notEqual(laterAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(firstClickAt < prizeAt);
  assert.ok(firstClickAt < windowAt);
  assert.ok(prizeAt < claimAt);
  assert.ok(claimAt < laterAt);
  assert.match(occupied, /data-week-occupied="true"/);
  assert.match(occupied, /data-rolling-week=""/);
  assert.match(occupied, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.match(occupied, /class="period-meta week-window"/);
  assert.match(occupied, /data-prize=""/);
  assert.match(occupied, /Hear last 7 days/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /class="queue later-stack"/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, />Outbid</);
  assert.doesNotMatch(occupied, /data-empty-week/);
  assert.doesNotMatch(occupied, /data-empty-bid-five/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /Then the listen URL/);
  assert.doesNotMatch(occupied, /24h lock/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, /class="station-desk hear-first"/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-prize=""/g) ?? []).length, 1);

  assert.match(
    cssSource,
    /\.week-occupied \.period-meta\.week-window\[data-rolling-week\]/,
  );
  assert.match(cssSource, /\.week-empty \[data-rolling-week\]/);
  assert.doesNotMatch(formSource, /data-rolling-week/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
});

test("empty station copy is a rolling last-7-days window — not Monday 00:00 UTC", () => {
  const empty = renderBoard([]);
  const bidAt = empty.indexOf("Bid USD");
  const windowAt = empty.indexOf('data-empty-window=""');
  const openingAt = empty.indexOf("No opening song");
  const claimAt = empty.indexOf('id="claim"');
  const firstClickAt = empty.indexOf('data-first-click="claim"');
  assert.notEqual(bidAt, -1);
  assert.notEqual(windowAt, -1);
  assert.notEqual(openingAt, -1);
  assert.notEqual(claimAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.ok(bidAt < windowAt);
  assert.ok(windowAt < openingAt);
  assert.ok(openingAt < claimAt);
  assert.ok(claimAt < firstClickAt);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-opening-song="false"/);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /class="period-meta"/);
  assert.match(empty, /data-empty-window=""/);
  assert.match(empty, /Last 7 days from a paid open\. Not Monday midnight UTC\./);
  assert.match(empty, /The open is last 7 days from that payment — not Monday midnight UTC\./);
  assert.match(empty, /There is no player last 7 days/);
  assert.match(empty, /A completed payment claims #1/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, />Outbid</);
  assert.doesNotMatch(empty, /Next reset/);
  assert.doesNotMatch(empty, /2026-08-24T00:00:00\.000Z/);
  assert.doesNotMatch(empty, /data-next-reset/);
  assert.doesNotMatch(empty, /data-rolling-week/);
  assert.doesNotMatch(empty, /Rolling last 7 days/);
  assert.doesNotMatch(empty, /class="period-meta week-window"/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /data-prize=/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /24h lock/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-window=""/g) ?? []).length, 1);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  const prizeAt = occupied.indexOf(
    '<h1 class="opening-track" data-prize="">Cold Open</h1>',
  );
  const hearClickAt = occupied.indexOf('data-first-click="hear"');
  const occupiedWindowAt = occupied.indexOf('data-rolling-week=""');
  const occupiedClaimAt = occupied.indexOf('id="claim"');
  assert.notEqual(prizeAt, -1);
  assert.notEqual(hearClickAt, -1);
  assert.notEqual(occupiedWindowAt, -1);
  assert.notEqual(occupiedClaimAt, -1);
  assert.ok(hearClickAt < prizeAt);
  assert.ok(prizeAt < occupiedClaimAt);
  assert.match(occupied, /data-week-occupied="true"/);
  assert.match(occupied, /data-rolling-week=""/);
  assert.match(occupied, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.match(occupied, /class="period-meta week-window"/);
  assert.match(occupied, /data-prize=""/);
  assert.match(occupied, /Hear last 7 days/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.doesNotMatch(occupied, /data-empty-week/);
  assert.doesNotMatch(occupied, /data-empty-window/);
  assert.doesNotMatch(occupied, /Last 7 days from a paid open/);
  assert.doesNotMatch(occupied, /data-empty-bid-five/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /24h lock/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-prize=""/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /data-unpaid-off=""/);
  assert.match(leftover, /data-empty-window=""/);
  assert.match(leftover, /Last 7 days from a paid open/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.match(leftover, /Claim #1 for/);
  assert.doesNotMatch(leftover, /data-rolling-week/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(
    cssSource,
    /\.week-empty \.period-meta\[data-empty-window\]/,
  );
  assert.match(cssSource, /Empty week names last 7 days/);
  assert.match(cssSource, /\.week-occupied \[data-empty-window\]/);
  const emptyWindowRule =
    cssSource.match(
      /\.week-empty \.period-meta\[data-empty-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyWindowRule, /font-size: 0\.86rem/);
  assert.match(emptyWindowRule, /font-weight: 600/);
  assert.doesNotMatch(emptyWindowRule, /background:/);
  const emptyNoteRule =
    cssSource.match(/\.week-empty \.empty-deck \.deck-note\s*\{[^}]+\}/)?.[0] ??
    "";
  assert.match(emptyNoteRule, /font-weight: 600/);
  assert.doesNotMatch(emptyNoteRule, /background:/);
  assert.doesNotMatch(formSource, /data-empty-window/);
  assert.doesNotMatch(formSource, /data-rolling-week/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(pageSource, /Until\s+then this week stays empty/);
  assert.doesNotMatch(pageSource, /Next reset \{nextResetAt\}/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
});

test("occupied Hear / later tracks name last-7-days — not this week", () => {
  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  const firstReadAt = occupied.indexOf('data-first-read="hear"');
  const windowAt = occupied.indexOf('data-occupied-window=""');
  const hearAt = occupied.indexOf('data-hear-window=""');
  const firstClickAt = occupied.indexOf('data-first-click="hear"');
  const prizeAt = occupied.indexOf(
    '<h1 class="opening-track" data-prize="">Cold Open</h1>',
  );
  const claimAt = occupied.indexOf('id="claim"');
  const laterAt = occupied.indexOf('data-later-window=""');
  const stackAt = occupied.indexOf('data-later-stack=""');
  assert.notEqual(firstReadAt, -1);
  assert.notEqual(windowAt, -1);
  assert.notEqual(hearAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.notEqual(laterAt, -1);
  assert.notEqual(stackAt, -1);
  assert.ok(firstReadAt < hearAt);
  assert.ok(hearAt < prizeAt);
  assert.ok(prizeAt < claimAt);
  assert.ok(claimAt < stackAt);
  assert.ok(stackAt < laterAt);
  assert.match(occupied, /data-week-occupied="true"/);
  assert.match(occupied, /data-occupied-window=""/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /Last 7 days&#x27; opening song is on/);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /data-rolling-week=""/);
  assert.match(occupied, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.match(occupied, /Same listen URL pays only the difference/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /data-prize=""/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, />Outbid</);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /This week&#x27;s opening song is on/);
  assert.doesNotMatch(occupied, /data-empty-week/);
  assert.doesNotMatch(occupied, /data-empty-window/);
  assert.doesNotMatch(occupied, /Last 7 days from a paid open/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /24h lock/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, /class="station-desk hear-first"/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-hear-window=""/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-later-window=""/g) ?? []).length, 1);

  const empty = renderBoard([]);
  const bidAt = empty.indexOf("Bid USD");
  const emptyWindowAt = empty.indexOf('data-empty-window=""');
  const firstClaimAt = empty.indexOf('data-first-click="claim"');
  assert.notEqual(bidAt, -1);
  assert.notEqual(emptyWindowAt, -1);
  assert.notEqual(firstClaimAt, -1);
  assert.ok(bidAt < emptyWindowAt);
  assert.ok(emptyWindowAt < firstClaimAt);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /Last 7 days from a paid open\. Not Monday midnight UTC\./);
  assert.match(empty, /The open is last 7 days from that payment — not Monday midnight UTC\./);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, /Bid USD/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /Also this week/);
  assert.doesNotMatch(empty, /data-hear-window/);
  assert.doesNotMatch(empty, /data-later-window/);
  assert.doesNotMatch(empty, /data-occupied-window/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /data-rolling-week/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /24h lock/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);

  assert.match(pageSource, /Hear last 7 days/);
  assert.match(pageSource, /Also last 7 days/);
  assert.match(pageSource, /Last 7 days&apos; opening song is on/);
  assert.doesNotMatch(pageSource, /Hear this week/);
  assert.doesNotMatch(pageSource, /Also this week/);
  assert.doesNotMatch(pageSource, /This week&apos;s opening song is on/);
  assert.match(
    cssSource,
    /Occupied Hear \/ later tracks name last 7 days/,
  );
  assert.match(
    cssSource,
    /\.week-occupied \.lede\[data-first-read="hear"\]\[data-occupied-window\]/,
  );
  assert.match(cssSource, /\.week-occupied \.opening-listen\[data-hear-window\]/);
  assert.match(
    cssSource,
    /\.week-occupied \.queue\.later-stack\[data-later-stack\] \.queue-head h2\[data-later-window\]/,
  );
  assert.match(cssSource, /\.week-empty \[data-occupied-window\]/);
  assert.match(cssSource, /\.week-empty \[data-hear-window\]/);
  assert.match(cssSource, /\.week-empty \[data-later-window\]/);
  const ledeRule =
    cssSource.match(
      /\.week-occupied \.lede\[data-first-read="hear"\]\[data-occupied-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(ledeRule, /font-weight:\s*600/);
  assert.doesNotMatch(ledeRule, /background:/);
  const hearWindowRule =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(hearWindowRule, /font-weight:\s*700/);
  assert.doesNotMatch(hearWindowRule, /background:/);
  assert.doesNotMatch(hearWindowRule, /min-height:/);
  const laterRule =
    cssSource.match(
      /\.week-occupied \.queue\.later-stack\[data-later-stack\] \.queue-head h2\[data-later-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(laterRule, /font-size:\s*1\.05rem/);
  assert.match(laterRule, /font-weight:\s*600/);
  assert.doesNotMatch(laterRule, /background:/);
  assert.doesNotMatch(formSource, /data-hear-window/);
  assert.doesNotMatch(formSource, /data-later-window/);
  assert.doesNotMatch(formSource, /data-occupied-window/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /raise-identity|raise-rolling/);
});

test("empty Claim / deck name last-7-days — not this week", () => {
  const empty = renderBoard([]);
  const kickerAt = empty.indexOf('data-empty-kicker=""');
  const claimWindowAt = empty.indexOf('data-empty-claim-window=""');
  const claimAt = empty.indexOf('id="claim"');
  const claimCopyAt = empty.indexOf("Claim #1 for");
  const firstClickAt = empty.indexOf('data-first-click="claim"');
  assert.notEqual(kickerAt, -1);
  assert.notEqual(claimWindowAt, -1);
  assert.notEqual(claimAt, -1);
  assert.notEqual(claimCopyAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.ok(kickerAt < claimAt);
  assert.ok(claimAt < claimWindowAt);
  assert.ok(claimCopyAt < firstClickAt);
  assert.ok(claimWindowAt < firstClickAt);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-empty-kicker=""/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /No opening song last 7 days/);
  assert.match(empty, /There is no player last 7 days/);
  assert.match(empty, /data-empty-claim-window=""/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /Last 7 days from a paid open\. Not Monday midnight UTC\./);
  assert.doesNotMatch(empty, /This week&#x27;s open/);
  assert.doesNotMatch(empty, /\$5 claims this week/);
  assert.doesNotMatch(empty, /No opening song this week/);
  assert.doesNotMatch(empty, /There is no player this week/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-hear-window/);
  assert.doesNotMatch(empty, /data-later-window/);
  assert.doesNotMatch(empty, /data-occupied-window/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /24h lock/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-kicker=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-claim-window=""/g) ?? []).length, 1);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /Last 7 days&#x27; opening song is on/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-occupied-window=""/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, /On air · opening song/);
  assert.doesNotMatch(occupied, /data-empty-kicker/);
  assert.doesNotMatch(occupied, /data-empty-claim-window/);
  assert.doesNotMatch(occupied, /Last 7 days&#x27; open</);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /This week&#x27;s open/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /24h lock/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /Last 7 days&#x27; open/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /data-first-click="claim"/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /This week&#x27;s open/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(pageSource, /Last 7 days&apos; open/);
  assert.match(pageSource, /No opening song last 7 days/);
  assert.match(pageSource, /There is no player last 7 days/);
  assert.doesNotMatch(pageSource, /This week&apos;s open/);
  assert.doesNotMatch(pageSource, /No opening song this week/);
  assert.doesNotMatch(pageSource, /There is no player this week/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.doesNotMatch(formSource, /claims this week's opening song/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.match(
    cssSource,
    /Empty Claim \/ deck name last 7 days/,
  );
  assert.match(
    cssSource,
    /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]/,
  );
  assert.match(
    cssSource,
    /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]/,
  );
  const kickerRule =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerRule, /font-weight:\s*600/);
  assert.doesNotMatch(kickerRule, /background:/);
  const claimRule =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimRule, /font-weight:\s*600/);
  assert.doesNotMatch(claimRule, /background:/);
  const occupiedHearRule =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearRule, /font-weight:\s*700/);
  assert.doesNotMatch(formSource, /data-empty-kicker/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("empty lede names last-7-days — not this week", () => {
  const empty = renderBoard([]);
  const ledeWindowAt = empty.indexOf('data-empty-lede-window=""');
  const bidReadAt = empty.indexOf('data-first-read="bid"');
  const bidCopyAt = empty.indexOf("Bid USD");
  const openCopyAt = empty.indexOf("Open last 7 days");
  const kickerAt = empty.indexOf('data-empty-kicker=""');
  const claimWindowAt = empty.indexOf('data-empty-claim-window=""');
  const claimAt = empty.indexOf('id="claim"');
  const firstClickAt = empty.indexOf('data-first-click="claim"');
  assert.notEqual(ledeWindowAt, -1);
  assert.notEqual(bidReadAt, -1);
  assert.notEqual(bidCopyAt, -1);
  assert.notEqual(openCopyAt, -1);
  assert.notEqual(kickerAt, -1);
  assert.notEqual(claimWindowAt, -1);
  assert.notEqual(claimAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.ok(ledeWindowAt < kickerAt);
  assert.ok(bidReadAt < claimAt);
  assert.ok(bidCopyAt < openCopyAt);
  assert.ok(openCopyAt < claimAt);
  assert.ok(kickerAt < claimAt);
  assert.ok(claimWindowAt < firstClickAt);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /data-empty-lede-window=""/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /Last 7 days from a paid open\. Not Monday midnight UTC\./);
  assert.doesNotMatch(empty, /Open the week/);
  assert.doesNotMatch(empty, /This week&#x27;s open/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-hear-window/);
  assert.doesNotMatch(empty, /data-later-window/);
  assert.doesNotMatch(empty, /data-occupied-window/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /24h lock/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-lede-window=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-kicker=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-claim-window=""/g) ?? []).length, 1);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /Last 7 days&#x27; opening song is on/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-occupied-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, /On air · opening song/);
  assert.doesNotMatch(occupied, /data-empty-lede-window/);
  assert.doesNotMatch(occupied, /data-empty-kicker/);
  assert.doesNotMatch(occupied, /data-empty-claim-window/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /Last 7 days&#x27; open</);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Open the week/);
  assert.doesNotMatch(occupied, /This week&#x27;s open/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /24h lock/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-first-read="hear"/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /data-empty-lede-window=""/);
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /Last 7 days&#x27; open/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /data-first-click="claim"/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Open the week/);
  assert.doesNotMatch(leftover, /This week&#x27;s open/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /data-empty-lede-window=""/);
  assert.match(pageSource, /Last 7 days&apos; open/);
  assert.doesNotMatch(pageSource, /Open the week/);
  assert.doesNotMatch(pageSource, /This week&apos;s open/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.doesNotMatch(formSource, /data-empty-lede-window/);
  assert.doesNotMatch(formSource, /Open last 7 days/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  assert.match(
    cssSource,
    /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]/,
  );
  assert.match(cssSource, /\.week-occupied \[data-empty-lede-window\]/);
  const emptyLedeRule =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedeRule, /font-weight:\s*600/);
  assert.doesNotMatch(emptyLedeRule, /background:/);
  const occupiedHearRule =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearRule, /font-weight:\s*700/);
  const kickerRule =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerRule, /font-weight:\s*600/);
  const claimRule =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimRule, /font-weight:\s*600/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("empty meta names last-7-days — not this week", () => {
  const empty = renderBoard([]);
  const metaCopyAt = layoutSource.indexOf(
    "Bid USD. Open last 7 days. Listeners hear you first. Rank is the bid. Playback is real.",
  );
  const titleAt = layoutSource.indexOf('title: "Playlist Headline"');
  const ledeWindowAt = empty.indexOf('data-empty-lede-window=""');
  const bidReadAt = empty.indexOf('data-first-read="bid"');
  const openCopyAt = empty.indexOf("Open last 7 days");
  const kickerAt = empty.indexOf('data-empty-kicker=""');
  const claimWindowAt = empty.indexOf('data-empty-claim-window=""');
  const claimAt = empty.indexOf('id="claim"');
  const firstClickAt = empty.indexOf('data-first-click="claim"');
  assert.notEqual(metaCopyAt, -1);
  assert.notEqual(titleAt, -1);
  assert.notEqual(ledeWindowAt, -1);
  assert.notEqual(bidReadAt, -1);
  assert.notEqual(openCopyAt, -1);
  assert.notEqual(kickerAt, -1);
  assert.notEqual(claimWindowAt, -1);
  assert.notEqual(claimAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.ok(titleAt < metaCopyAt);
  assert.ok(ledeWindowAt < kickerAt);
  assert.ok(bidReadAt < claimAt);
  assert.ok(openCopyAt < claimAt);
  assert.ok(kickerAt < claimAt);
  assert.ok(claimWindowAt < firstClickAt);
  assert.match(
    layoutSource,
    /Bid USD\. Open last 7 days\. Listeners hear you first\. Rank is the bid\.\s*Playback is real\./,
  );
  assert.match(layoutSource, /Leaderboard/);
  assert.match(layoutSource, /href="\/about"/);
  assert.match(layoutSource, /href="\/rules"/);
  assert.doesNotMatch(layoutSource, /Open the week/);
  assert.doesNotMatch(layoutSource, /Hear last 7 days/);
  assert.doesNotMatch(layoutSource, /Hear this week/);
  assert.doesNotMatch(layoutSource, /data-first-read="hear"/);
  assert.doesNotMatch(layoutSource, /data-first-click="hear"/);
  assert.doesNotMatch(layoutSource, /24h lock/);
  assert.doesNotMatch(layoutSource, /hear-after-need-N/);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /data-empty-lede-window=""/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /Last 7 days from a paid open\. Not Monday midnight UTC\./);
  assert.doesNotMatch(empty, /Open the week/);
  assert.doesNotMatch(empty, /This week&#x27;s open/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-hear-window/);
  assert.doesNotMatch(empty, /data-later-window/);
  assert.doesNotMatch(empty, /data-occupied-window/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /24h lock/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-lede-window=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-kicker=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-claim-window=""/g) ?? []).length, 1);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /Last 7 days&#x27; opening song is on/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-occupied-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, /On air · opening song/);
  assert.doesNotMatch(occupied, /data-empty-lede-window/);
  assert.doesNotMatch(occupied, /data-empty-kicker/);
  assert.doesNotMatch(occupied, /data-empty-claim-window/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /Last 7 days&#x27; open</);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Open the week/);
  assert.doesNotMatch(occupied, /This week&#x27;s open/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /24h lock/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-first-read="hear"/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /data-empty-lede-window=""/);
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /Last 7 days&#x27; open/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /data-first-click="claim"/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Open the week/);
  assert.doesNotMatch(leftover, /This week&#x27;s open/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /data-empty-lede-window=""/);
  assert.match(pageSource, /Last 7 days&apos; open/);
  assert.doesNotMatch(pageSource, /Open the week/);
  assert.doesNotMatch(pageSource, /This week&apos;s open/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.doesNotMatch(formSource, /data-empty-lede-window/);
  assert.doesNotMatch(formSource, /Open last 7 days/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.match(cssSource, /Empty site metadata names last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  assert.match(
    cssSource,
    /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]/,
  );
  assert.match(cssSource, /\.week-occupied \[data-empty-lede-window\]/);
  const emptyLedeKeep =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedeKeep, /font-weight:\s*600/);
  assert.doesNotMatch(emptyLedeKeep, /background:/);
  const occupiedHearKeep =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearKeep, /font-weight:\s*700/);
  const kickerKeep =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerKeep, /font-weight:\s*600/);
  const claimKeep =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimKeep, /font-weight:\s*600/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("empty pitch names last-7-days — not this week", () => {
  const pitchAt = specSource.indexOf(
    "One-line pitch: **Bid USD. Open last 7 days. Listeners hear you first.**",
  );
  const metaCopyAt = layoutSource.indexOf(
    "Bid USD. Open last 7 days. Listeners hear you first. Rank is the bid. Playback is real.",
  );
  const empty = renderBoard([]);
  const ledeWindowAt = empty.indexOf('data-empty-lede-window=""');
  const bidReadAt = empty.indexOf('data-first-read="bid"');
  const openCopyAt = empty.indexOf("Open last 7 days");
  const kickerAt = empty.indexOf('data-empty-kicker=""');
  const claimWindowAt = empty.indexOf('data-empty-claim-window=""');
  const claimAt = empty.indexOf('id="claim"');
  const firstClickAt = empty.indexOf('data-first-click="claim"');
  assert.notEqual(pitchAt, -1);
  assert.notEqual(metaCopyAt, -1);
  assert.notEqual(ledeWindowAt, -1);
  assert.notEqual(bidReadAt, -1);
  assert.notEqual(openCopyAt, -1);
  assert.notEqual(kickerAt, -1);
  assert.notEqual(claimWindowAt, -1);
  assert.notEqual(claimAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.ok(ledeWindowAt < kickerAt);
  assert.ok(bidReadAt < claimAt);
  assert.ok(openCopyAt < claimAt);
  assert.ok(kickerAt < claimAt);
  assert.ok(claimWindowAt < firstClickAt);
  assert.match(
    specSource,
    /One-line pitch: \*\*Bid USD\. Open last 7 days\. Listeners hear you first\.\*\*/,
  );
  assert.match(
    specSource,
    /Empty product pitch names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty site metadata names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty lede names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty Claim #1 and the empty deck kicker name last 7 days/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(specSource, /Open the week/);
  assert.doesNotMatch(
    specSource,
    /One-line pitch: \*\*Bid USD\. Open the week/,
  );
  assert.match(
    layoutSource,
    /Bid USD\. Open last 7 days\. Listeners hear you first\. Rank is the bid\.\s*Playback is real\./,
  );
  assert.match(layoutSource, /Leaderboard/);
  assert.match(layoutSource, /href="\/about"/);
  assert.match(layoutSource, /href="\/rules"/);
  assert.doesNotMatch(layoutSource, /Open the week/);
  assert.doesNotMatch(layoutSource, /Hear last 7 days/);
  assert.doesNotMatch(layoutSource, /Hear this week/);
  assert.doesNotMatch(layoutSource, /data-first-read="hear"/);
  assert.doesNotMatch(layoutSource, /data-first-click="hear"/);
  assert.doesNotMatch(layoutSource, /24h lock/);
  assert.doesNotMatch(layoutSource, /hear-after-need-N/);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /data-empty-lede-window=""/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, /Then the listen URL/);
  assert.match(empty, />Outbid</);
  assert.match(empty, /data-empty-bid-five=""/);
  assert.match(empty, /Last 7 days from a paid open\. Not Monday midnight UTC\./);
  assert.doesNotMatch(empty, /Open the week/);
  assert.doesNotMatch(empty, /This week&#x27;s open/);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-hear-window/);
  assert.doesNotMatch(empty, /data-later-window/);
  assert.doesNotMatch(empty, /data-occupied-window/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /24h lock/);
  assert.doesNotMatch(empty, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-lede-window=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-kicker=""/g) ?? []).length, 1);
  assert.equal((empty.match(/data-empty-claim-window=""/g) ?? []).length, 1);

  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /Last 7 days&#x27; opening song is on/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-occupied-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.match(occupied, /On air · opening song/);
  assert.doesNotMatch(occupied, /data-empty-lede-window/);
  assert.doesNotMatch(occupied, /data-empty-kicker/);
  assert.doesNotMatch(occupied, /data-empty-claim-window/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /Last 7 days&#x27; open</);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Open the week/);
  assert.doesNotMatch(occupied, /This week&#x27;s open/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, /24h lock/);
  assert.doesNotMatch(occupied, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/data-first-read="hear"/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /data-empty-lede-window=""/);
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /Last 7 days&#x27; open/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /data-first-click="claim"/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Open the week/);
  assert.doesNotMatch(leftover, /This week&#x27;s open/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /data-empty-lede-window=""/);
  assert.match(pageSource, /Last 7 days&apos; open/);
  assert.doesNotMatch(pageSource, /Open the week/);
  assert.doesNotMatch(pageSource, /This week&apos;s open/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.doesNotMatch(formSource, /data-empty-lede-window/);
  assert.doesNotMatch(formSource, /Open last 7 days/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(formSource, /Claim #1 for/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.match(cssSource, /Empty product pitch names last 7 days/);
  assert.match(cssSource, /Empty site metadata names last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  assert.match(
    cssSource,
    /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]/,
  );
  assert.match(cssSource, /\.week-occupied \[data-empty-lede-window\]/);
  const emptyLedePitchKeep =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedePitchKeep, /font-weight:\s*600/);
  assert.doesNotMatch(emptyLedePitchKeep, /background:/);
  const occupiedHearPitchKeep =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearPitchKeep, /font-weight:\s*700/);
  const kickerPitchKeep =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerPitchKeep, /font-weight:\s*600/);
  const claimPitchKeep =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimPitchKeep, /font-weight:\s*600/);
  const pitchCommentAt = cssSource.indexOf(
    "Empty product pitch names last 7 days",
  );
  const metaCommentAt = cssSource.indexOf(
    "Empty site metadata names last 7 days",
  );
  const ledeCommentAt = cssSource.indexOf("Empty lede names last 7 days");
  assert.ok(ledeCommentAt >= 0 && metaCommentAt > ledeCommentAt);
  assert.ok(pitchCommentAt > metaCommentAt);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("rules min-bid names last-7-days — not this week", () => {
  const rules = renderToStaticMarkup(createElement(RulesPage));
  const minBidAt = rules.indexOf("First bid for a listing last 7 days must be");
  const fiveAt = rules.indexOf("<strong>$5</strong>");
  const raiseAt = rules.indexOf(
    "Same canonical listen URL still inside last 7 days raises",
  );
  assert.notEqual(minBidAt, -1);
  assert.notEqual(fiveAt, -1);
  assert.notEqual(raiseAt, -1);
  assert.ok(minBidAt < fiveAt);
  assert.ok(minBidAt < raiseAt);
  assert.match(
    specSource,
    /\*\*\$5\*\* on a first bid for a listing last 7 days/,
  );
  assert.match(
    specSource,
    /Rules min-bid copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /One-line pitch: \*\*Bid USD\. Open last 7 days\. Listeners hear you first\.\*\*/,
  );
  assert.match(
    specSource,
    /Empty product pitch names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty site metadata names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty lede names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty Claim #1 and the empty deck kicker name last 7 days/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(
    specSource,
    /\*\*\$5\*\* on a first bid for a listing in this week/,
  );
  assert.match(
    rulesSource,
    /First bid for a listing last 7 days must be <strong>\$5<\/strong>/,
  );
  assert.doesNotMatch(
    rulesSource,
    /First bid for a listing this week must be/,
  );
  assert.doesNotMatch(rulesSource, /Hear last 7 days/);
  assert.doesNotMatch(rulesSource, /Hear this week/);
  assert.doesNotMatch(rulesSource, /data-first-click="hear"/);
  assert.doesNotMatch(rulesSource, /hear-after-need-N/);
  assert.match(rules, /data-page="rules"/);
  assert.match(rules, /First bid for a listing last 7 days must be/);
  assert.match(rules, /<strong>\$5<\/strong>/);
  assert.match(rules, /Older wins ties/);
  assert.match(rules, /Raise pays difference/);
  assert.match(rules, /Same canonical listen URL still inside last 7 days raises/);
  assert.match(rules, /Rolling last 7 days\. Not Monday 00:00 UTC/);
  assert.match(rules, /empty open is last 7 days from a paid claim/);
  assert.doesNotMatch(rules, /First bid for a listing this week/);
  assert.doesNotMatch(rules, /Hear last 7 days/);
  assert.doesNotMatch(rules, /Hear this week/);
  assert.doesNotMatch(rules, /data-first-click="hear"/);
  assert.doesNotMatch(rules, /1\.2M streams/);

  const empty = renderBoard([]);
  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, />Outbid</);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(layoutSource, /Bid USD\. Open last 7 days\. Listeners hear you first/);
  assert.doesNotMatch(layoutSource, /Hear last 7 days/);
  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.doesNotMatch(pageSource, /Hear this week/);
  assert.doesNotMatch(pageSource, /Also this week/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.match(formSource, /Claim #1 for/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(cssSource, /Rules min-bid names last 7 days/);
  assert.match(cssSource, /Empty product pitch names last 7 days/);
  assert.match(cssSource, /Empty site metadata names last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  const rulesCommentAt = cssSource.indexOf("Rules min-bid names last 7 days");
  const pitchCommentAt = cssSource.indexOf(
    "Empty product pitch names last 7 days",
  );
  const metaCommentAt = cssSource.indexOf(
    "Empty site metadata names last 7 days",
  );
  assert.ok(pitchCommentAt > metaCommentAt);
  assert.ok(rulesCommentAt > pitchCommentAt);
  const occupiedHearKeep =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearKeep, /font-weight:\s*700/);
  const emptyLedeKeep =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedeKeep, /font-weight:\s*600/);
  const kickerKeep =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerKeep, /font-weight:\s*600/);
  const claimKeep =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimKeep, /font-weight:\s*600/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("about weekly names last-7-days — not this week", () => {
  const about = renderToStaticMarkup(createElement(AboutPage));
  const auctionAt = about.indexOf("public auction last 7 days");
  const rankAt = about.indexOf("Rank is the bid");
  const playbackAt = about.indexOf("Playback is real");
  assert.notEqual(auctionAt, -1);
  assert.notEqual(rankAt, -1);
  assert.notEqual(playbackAt, -1);
  assert.ok(auctionAt < rankAt);
  assert.ok(rankAt < playbackAt);
  assert.match(
    specSource,
    /A public auction last 7 days for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    specSource,
    /About copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Rules min-bid copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /\*\*\$5\*\* on a first bid for a listing last 7 days/,
  );
  assert.match(
    specSource,
    /One-line pitch: \*\*Bid USD\. Open last 7 days\. Listeners hear you first\.\*\*/,
  );
  assert.match(
    specSource,
    /Empty product pitch names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty site metadata names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty lede names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty Claim #1 and the empty deck kicker name last 7 days/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(
    specSource,
    /A weekly public auction for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    aboutSource,
    /Public auction last 7 days for the opening song\. Rank is the bid\. Playback is real\. No invented play counts\./,
  );
  assert.match(
    aboutSource,
    /Playlist Headline is a public auction last 7 days for the/,
  );
  assert.doesNotMatch(aboutSource, /Weekly public auction/);
  assert.doesNotMatch(aboutSource, /weekly public auction/);
  assert.doesNotMatch(aboutSource, /Hear last 7 days/);
  assert.doesNotMatch(aboutSource, /Hear this week/);
  assert.doesNotMatch(aboutSource, /data-first-click="hear"/);
  assert.doesNotMatch(aboutSource, /hear-after-need-N/);
  assert.match(
    rulesSource,
    /First bid for a listing last 7 days must be <strong>\$5<\/strong>/,
  );
  assert.doesNotMatch(
    rulesSource,
    /First bid for a listing this week must be/,
  );
  assert.match(about, /data-page="about"/);
  assert.match(about, /public auction last 7 days/);
  assert.match(about, /<strong>first track \/ opening song<\/strong>/);
  assert.match(about, /Rank is the bid/);
  assert.match(about, /Playback is real/);
  assert.match(about, /no fake streams/i);
  assert.match(about, /no invented play counts/i);
  assert.match(about, /rolling last 7 days/i);
  assert.match(about, /playlist-headline/);
  assert.match(about, /outbid\.lol/);
  assert.doesNotMatch(about, /weekly public auction/i);
  assert.doesNotMatch(about, /Hear last 7 days/);
  assert.doesNotMatch(about, /Hear this week/);
  assert.doesNotMatch(about, /data-first-click="hear"/);
  assert.doesNotMatch(about, /1\.2M streams/);

  const empty = renderBoard([]);
  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, />Outbid</);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(layoutSource, /Bid USD\. Open last 7 days\. Listeners hear you first/);
  assert.doesNotMatch(layoutSource, /Hear last 7 days/);
  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.doesNotMatch(pageSource, /Hear this week/);
  assert.doesNotMatch(pageSource, /Also this week/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.match(formSource, /Claim #1 for/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(cssSource, /About weekly names last 7 days/);
  assert.match(cssSource, /Rules min-bid names last 7 days/);
  assert.match(cssSource, /Empty product pitch names last 7 days/);
  assert.match(cssSource, /Empty site metadata names last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  const aboutCommentAt = cssSource.indexOf("About weekly names last 7 days");
  const aboutRulesCommentAt = cssSource.indexOf(
    "Rules min-bid names last 7 days",
  );
  const aboutPitchCommentAt = cssSource.indexOf(
    "Empty product pitch names last 7 days",
  );
  const aboutMetaCommentAt = cssSource.indexOf(
    "Empty site metadata names last 7 days",
  );
  assert.ok(aboutPitchCommentAt > aboutMetaCommentAt);
  assert.ok(aboutRulesCommentAt > aboutPitchCommentAt);
  assert.ok(aboutCommentAt > aboutRulesCommentAt);
  const occupiedHearAboutKeep =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearAboutKeep, /font-weight:\s*700/);
  const emptyLedeAboutKeep =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedeAboutKeep, /font-weight:\s*600/);
  const kickerAboutKeep =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerAboutKeep, /font-weight:\s*600/);
  const claimAboutKeep =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimAboutKeep, /font-weight:\s*600/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("README weekly names last-7-days — not this week", () => {
  const auctionAt = readmeSource.indexOf(
    "Public auction last 7 days for the first track / opening song",
  );
  const rollingAt = readmeSource.indexOf("rolling last-7-days window");
  const rankAt = readmeSource.indexOf("Rank is the bid");
  const playbackAt = readmeSource.indexOf("Playback is real");
  assert.notEqual(auctionAt, -1);
  assert.notEqual(rollingAt, -1);
  assert.notEqual(rankAt, -1);
  assert.notEqual(playbackAt, -1);
  assert.ok(auctionAt < rollingAt);
  assert.ok(rollingAt < rankAt);
  assert.ok(rankAt < playbackAt);
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song on a real playlist or live radio/,
  );
  assert.match(
    readmeSource,
    /Rank lives in a rolling last-7-days window, not Monday 00:00 UTC/,
  );
  assert.doesNotMatch(readmeSource, /Weekly public auction/);
  assert.doesNotMatch(readmeSource, /weekly public auction/);
  assert.doesNotMatch(readmeSource, /Hear last 7 days/);
  assert.doesNotMatch(readmeSource, /Hear this week/);
  assert.doesNotMatch(readmeSource, /data-first-click="hear"/);
  assert.doesNotMatch(readmeSource, /hear-after-need-N/);
  assert.match(
    specSource,
    /README copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /About copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /A public auction last 7 days for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    specSource,
    /Rules min-bid copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /\*\*\$5\*\* on a first bid for a listing last 7 days/,
  );
  assert.match(
    specSource,
    /One-line pitch: \*\*Bid USD\. Open last 7 days\. Listeners hear you first\.\*\*/,
  );
  assert.match(
    specSource,
    /Empty product pitch names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty site metadata names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty lede names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty Claim #1 and the empty deck kicker name last 7 days/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(
    specSource,
    /A weekly public auction for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    aboutSource,
    /Public auction last 7 days for the opening song\. Rank is the bid\. Playback is real\. No invented play counts\./,
  );
  assert.match(
    aboutSource,
    /Playlist Headline is a public auction last 7 days for the/,
  );
  assert.doesNotMatch(aboutSource, /Weekly public auction/);
  assert.doesNotMatch(aboutSource, /weekly public auction/);
  assert.doesNotMatch(aboutSource, /Hear last 7 days/);
  assert.doesNotMatch(aboutSource, /Hear this week/);
  assert.doesNotMatch(aboutSource, /data-first-click="hear"/);
  assert.doesNotMatch(aboutSource, /hear-after-need-N/);
  assert.match(
    rulesSource,
    /First bid for a listing last 7 days must be <strong>\$5<\/strong>/,
  );
  assert.doesNotMatch(
    rulesSource,
    /First bid for a listing this week must be/,
  );
  const about = renderToStaticMarkup(createElement(AboutPage));
  assert.match(about, /data-page="about"/);
  assert.match(about, /public auction last 7 days/);
  assert.match(about, /<strong>first track \/ opening song<\/strong>/);
  assert.match(about, /Rank is the bid/);
  assert.match(about, /Playback is real/);
  assert.doesNotMatch(about, /weekly public auction/i);
  assert.doesNotMatch(about, /Hear last 7 days/);
  assert.doesNotMatch(about, /Hear this week/);

  const empty = renderBoard([]);
  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, />Outbid</);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(layoutSource, /Bid USD\. Open last 7 days\. Listeners hear you first/);
  assert.doesNotMatch(layoutSource, /Hear last 7 days/);
  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.doesNotMatch(pageSource, /Hear this week/);
  assert.doesNotMatch(pageSource, /Also this week/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.match(formSource, /Claim #1 for/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(cssSource, /README weekly names last 7 days/);
  assert.match(cssSource, /About weekly names last 7 days/);
  assert.match(cssSource, /Rules min-bid names last 7 days/);
  assert.match(cssSource, /Empty product pitch names last 7 days/);
  assert.match(cssSource, /Empty site metadata names last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  const readmeCommentAt = cssSource.indexOf("README weekly names last 7 days");
  const aboutCommentAt = cssSource.indexOf("About weekly names last 7 days");
  const aboutRulesCommentAt = cssSource.indexOf(
    "Rules min-bid names last 7 days",
  );
  const aboutPitchCommentAt = cssSource.indexOf(
    "Empty product pitch names last 7 days",
  );
  const aboutMetaCommentAt = cssSource.indexOf(
    "Empty site metadata names last 7 days",
  );
  assert.ok(readmeCommentAt > aboutCommentAt);
  assert.ok(aboutPitchCommentAt > aboutMetaCommentAt);
  assert.ok(aboutRulesCommentAt > aboutPitchCommentAt);
  assert.ok(aboutCommentAt > aboutRulesCommentAt);
  const occupiedHearReadmeKeep =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearReadmeKeep, /font-weight:\s*700/);
  const emptyLedeReadmeKeep =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedeReadmeKeep, /font-weight:\s*600/);
  const kickerReadmeKeep =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerReadmeKeep, /font-weight:\s*600/);
  const claimReadmeKeep =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimReadmeKeep, /font-weight:\s*600/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("SPEC persona names last-7-days — not this week", () => {
  const personaAt = specSource.indexOf(
    "Put a real track first last 7 days so listeners hear it first",
  );
  const personaCopyAt = specSource.indexOf(
    "SPEC persona copy names last 7 days, not this calendar week",
  );
  const readmeCopyAt = specSource.indexOf(
    "README copy names last 7 days, not this calendar week",
  );
  assert.notEqual(personaAt, -1);
  assert.notEqual(personaCopyAt, -1);
  assert.notEqual(readmeCopyAt, -1);
  assert.ok(readmeCopyAt < personaCopyAt);
  assert.match(
    specSource,
    /\| Artist \/ label \/ promoter \| Put a real track first last 7 days so listeners hear it first \|/,
  );
  assert.match(
    specSource,
    /SPEC persona copy names last 7 days, not this calendar week/,
  );
  assert.doesNotMatch(specSource, /Put a real track first this week/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.doesNotMatch(specSource, /data-first-click="hear"/);
  assert.doesNotMatch(specSource, /hear-after-need-N/);
  assert.match(
    specSource,
    /README copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /About copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /A public auction last 7 days for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    specSource,
    /Rules min-bid copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /\*\*\$5\*\* on a first bid for a listing last 7 days/,
  );
  assert.match(
    specSource,
    /One-line pitch: \*\*Bid USD\. Open last 7 days\. Listeners hear you first\.\*\*/,
  );
  assert.match(
    specSource,
    /Empty product pitch names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty site metadata names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty lede names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty Claim #1 and the empty deck kicker name last 7 days/,
  );
  assert.match(
    specSource,
    /Occupied Hear and later tracks name last 7 days, not this calendar week/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(
    specSource,
    /A weekly public auction for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song on a real playlist or live radio/,
  );
  assert.match(
    readmeSource,
    /Rank lives in a rolling last-7-days window, not Monday 00:00 UTC/,
  );
  assert.doesNotMatch(readmeSource, /Weekly public auction/);
  assert.doesNotMatch(readmeSource, /weekly public auction/);
  assert.doesNotMatch(readmeSource, /Hear last 7 days/);
  assert.doesNotMatch(readmeSource, /Hear this week/);
  assert.match(
    aboutSource,
    /Public auction last 7 days for the opening song\. Rank is the bid\. Playback is real\. No invented play counts\./,
  );
  assert.match(
    aboutSource,
    /Playlist Headline is a public auction last 7 days for the/,
  );
  assert.doesNotMatch(aboutSource, /Weekly public auction/);
  assert.doesNotMatch(aboutSource, /weekly public auction/);
  assert.doesNotMatch(aboutSource, /Hear last 7 days/);
  assert.doesNotMatch(aboutSource, /Hear this week/);
  assert.match(
    rulesSource,
    /First bid for a listing last 7 days must be <strong>\$5<\/strong>/,
  );
  assert.doesNotMatch(
    rulesSource,
    /First bid for a listing this week must be/,
  );

  const empty = renderBoard([]);
  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, />Outbid</);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(layoutSource, /Bid USD\. Open last 7 days\. Listeners hear you first/);
  assert.doesNotMatch(layoutSource, /Hear last 7 days/);
  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.doesNotMatch(pageSource, /Hear this week/);
  assert.doesNotMatch(pageSource, /Also this week/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.match(formSource, /Claim #1 for/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(cssSource, /SPEC persona names last 7 days/);
  assert.match(cssSource, /README weekly names last 7 days/);
  assert.match(cssSource, /About weekly names last 7 days/);
  assert.match(cssSource, /Rules min-bid names last 7 days/);
  assert.match(cssSource, /Empty product pitch names last 7 days/);
  assert.match(cssSource, /Empty site metadata names last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  const personaCommentAt = cssSource.indexOf("SPEC persona names last 7 days");
  const readmeCommentAt = cssSource.indexOf("README weekly names last 7 days");
  const aboutCommentAt = cssSource.indexOf("About weekly names last 7 days");
  const personaRulesCommentAt = cssSource.indexOf(
    "Rules min-bid names last 7 days",
  );
  const personaPitchCommentAt = cssSource.indexOf(
    "Empty product pitch names last 7 days",
  );
  const personaMetaCommentAt = cssSource.indexOf(
    "Empty site metadata names last 7 days",
  );
  assert.ok(personaCommentAt > readmeCommentAt);
  assert.ok(readmeCommentAt > aboutCommentAt);
  assert.ok(personaPitchCommentAt > personaMetaCommentAt);
  assert.ok(personaRulesCommentAt > personaPitchCommentAt);
  assert.ok(aboutCommentAt > personaRulesCommentAt);
  const occupiedHearPersonaKeep =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearPersonaKeep, /font-weight:\s*700/);
  const emptyLedePersonaKeep =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedePersonaKeep, /font-weight:\s*600/);
  const kickerPersonaKeep =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerPersonaKeep, /font-weight:\s*600/);
  const claimPersonaKeep =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimPersonaKeep, /font-weight:\s*600/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

test("SPEC empty-playback names last-7-days — not this week", () => {
  const emptyPlaybackAt = specSource.indexOf(
    "If last 7 days has no paid #1, there is no player and no opening song",
  );
  const emptyPlaybackCopyAt = specSource.indexOf(
    "SPEC empty-playback copy names last 7 days, not this calendar week",
  );
  const personaCopyAt = specSource.indexOf(
    "SPEC persona copy names last 7 days, not this calendar week",
  );
  assert.notEqual(emptyPlaybackAt, -1);
  assert.notEqual(emptyPlaybackCopyAt, -1);
  assert.notEqual(personaCopyAt, -1);
  assert.ok(personaCopyAt < emptyPlaybackCopyAt);
  assert.match(
    specSource,
    /If last 7 days has no paid #1, there is no player and no opening song\. Honest empty state\./,
  );
  assert.match(
    specSource,
    /SPEC empty-playback copy names last 7 days, not this calendar week/,
  );
  assert.doesNotMatch(specSource, /If the week has no paid #1/);
  assert.doesNotMatch(specSource, /Hear last 7 days/);
  assert.doesNotMatch(specSource, /Hear this week/);
  assert.doesNotMatch(specSource, /data-first-click="hear"/);
  assert.doesNotMatch(specSource, /hear-after-need-N/);
  assert.match(
    specSource,
    /SPEC persona copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /\| Artist \/ label \/ promoter \| Put a real track first last 7 days so listeners hear it first \|/,
  );
  assert.match(
    specSource,
    /README copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /About copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /A public auction last 7 days for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    specSource,
    /Rules min-bid copy names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /\*\*\$5\*\* on a first bid for a listing last 7 days/,
  );
  assert.match(
    specSource,
    /One-line pitch: \*\*Bid USD\. Open last 7 days\. Listeners hear you first\.\*\*/,
  );
  assert.match(
    specSource,
    /Empty product pitch names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty site metadata names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty lede names last 7 days, not this calendar week/,
  );
  assert.match(
    specSource,
    /Empty Claim #1 and the empty deck kicker name last 7 days/,
  );
  assert.match(
    specSource,
    /Occupied Hear and later tracks name last 7 days, not this calendar week/,
  );
  assert.match(specSource, /Empty stays Claim #1 first, no Hear/);
  assert.doesNotMatch(
    specSource,
    /A weekly public auction for the \*\*first track \/ opening song\*\*/,
  );
  assert.match(
    readmeSource,
    /Public auction last 7 days for the first track \/ opening song on a real playlist or live radio/,
  );
  assert.match(
    readmeSource,
    /Rank lives in a rolling last-7-days window, not Monday 00:00 UTC/,
  );
  assert.doesNotMatch(readmeSource, /Weekly public auction/);
  assert.doesNotMatch(readmeSource, /weekly public auction/);
  assert.doesNotMatch(readmeSource, /Hear last 7 days/);
  assert.doesNotMatch(readmeSource, /Hear this week/);
  assert.match(
    aboutSource,
    /Public auction last 7 days for the opening song\. Rank is the bid\. Playback is real\. No invented play counts\./,
  );
  assert.match(
    aboutSource,
    /Playlist Headline is a public auction last 7 days for the/,
  );
  assert.doesNotMatch(aboutSource, /Weekly public auction/);
  assert.doesNotMatch(aboutSource, /weekly public auction/);
  assert.doesNotMatch(aboutSource, /Hear last 7 days/);
  assert.doesNotMatch(aboutSource, /Hear this week/);
  assert.match(
    rulesSource,
    /First bid for a listing last 7 days must be <strong>\$5<\/strong>/,
  );
  assert.doesNotMatch(
    rulesSource,
    /First bid for a listing this week must be/,
  );

  const empty = renderBoard([]);
  const occupied = renderBoard([
    listing({
      id: "lst_open",
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      bidUsd: 12,
      firstPaidAt: "2026-08-16T12:00:00.000Z",
    }),
    listing({
      id: "lst_two",
      track: "Second Slot",
      artist: "Bea",
      listenUrl: "https://example.com/second-slot",
      bidUsd: 5,
      firstPaidAt: "2026-08-16T18:00:00.000Z",
    }),
  ]);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-first-read="bid"/);
  assert.match(empty, /Open last 7 days/);
  assert.match(empty, /Last 7 days&#x27; open/);
  assert.match(empty, /\$5 claims last 7 days/);
  assert.match(empty, /There is no player last 7 days/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /data-first-click="claim"/);
  assert.match(empty, />Outbid</);
  assert.doesNotMatch(empty, /Hear last 7 days/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /Also last 7 days/);
  assert.doesNotMatch(empty, /data-first-read="hear"/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.doesNotMatch(empty, /data-real-playback/);
  assert.doesNotMatch(empty, FORBIDDEN);
  assert.equal((empty.match(/data-first-read="bid"/g) ?? []).length, 1);
  assert.equal((empty.match(/data-first-click="claim"/g) ?? []).length, 1);
  assert.match(occupied, /Hear last 7 days&#x27; opening song/);
  assert.match(occupied, /Also last 7 days/);
  assert.match(occupied, /data-hear-window=""/);
  assert.match(occupied, /data-later-window=""/);
  assert.match(occupied, /data-first-read="hear"/);
  assert.match(occupied, /data-first-click="hear"/);
  assert.match(occupied, /Need \$13 to take #1/);
  assert.match(occupied, /Claim #1 for/);
  assert.doesNotMatch(occupied, /Open last 7 days/);
  assert.doesNotMatch(occupied, /\$5 claims last 7 days/);
  assert.doesNotMatch(occupied, /Hear this week/);
  assert.doesNotMatch(occupied, /Also this week/);
  assert.doesNotMatch(occupied, /data-first-click="claim"/);
  assert.doesNotMatch(occupied, FORBIDDEN);
  assert.equal((occupied.match(/Hear last 7 days/g) ?? []).length, 1);
  assert.equal((occupied.match(/Also last 7 days/g) ?? []).length, 1);

  const leftover = renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: [],
      unpaid: [
        {
          sessionId: "fix_abandoned",
          weekId: WEEK,
          track: "Ghost Track",
          artist: "Vapor",
          listenUrl: "https://example.com/ghost",
          bidUsd: 99,
        },
      ],
    }),
  );
  assert.match(leftover, /Open last 7 days/);
  assert.match(leftover, /\$5 claims last 7 days/);
  assert.match(leftover, /There is no player last 7 days/);
  assert.match(leftover, /Claim #1 for/);
  assert.match(leftover, /Unpaid Polar checkout stays off this desk/);
  assert.doesNotMatch(leftover, /Hear last 7 days/);
  assert.doesNotMatch(leftover, /Ghost Track|Vapor/);
  assert.doesNotMatch(leftover, FORBIDDEN);

  assert.match(layoutSource, /Bid USD\. Open last 7 days\. Listeners hear you first/);
  assert.doesNotMatch(layoutSource, /Hear last 7 days/);
  assert.match(pageSource, /Open last 7 days/);
  assert.match(pageSource, /There is no player last 7 days/);
  assert.match(pageSource, /Hear last 7 days&apos; opening song/);
  assert.match(pageSource, /Also last 7 days/);
  assert.doesNotMatch(pageSource, /Hear this week/);
  assert.doesNotMatch(pageSource, /Also this week/);
  assert.match(formSource, /claims last 7 days' opening song/);
  assert.match(formSource, /Claim #1 for/);
  assert.doesNotMatch(formSource, /Hear last 7 days/);
  assert.match(cssSource, /SPEC empty-playback names last 7 days/);
  assert.match(cssSource, /SPEC persona names last 7 days/);
  assert.match(cssSource, /README weekly names last 7 days/);
  assert.match(cssSource, /About weekly names last 7 days/);
  assert.match(cssSource, /Rules min-bid names last 7 days/);
  assert.match(cssSource, /Empty product pitch names last 7 days/);
  assert.match(cssSource, /Empty site metadata names last 7 days/);
  assert.match(cssSource, /Empty lede names last 7 days/);
  const emptyPlaybackCommentAt = cssSource.indexOf(
    "SPEC empty-playback names last 7 days",
  );
  const personaCommentAt = cssSource.indexOf("SPEC persona names last 7 days");
  const readmeCommentAt = cssSource.indexOf("README weekly names last 7 days");
  const aboutCommentAt = cssSource.indexOf("About weekly names last 7 days");
  const emptyPlaybackRulesCommentAt = cssSource.indexOf(
    "Rules min-bid names last 7 days",
  );
  const emptyPlaybackPitchCommentAt = cssSource.indexOf(
    "Empty product pitch names last 7 days",
  );
  const emptyPlaybackMetaCommentAt = cssSource.indexOf(
    "Empty site metadata names last 7 days",
  );
  assert.ok(emptyPlaybackCommentAt > personaCommentAt);
  assert.ok(personaCommentAt > readmeCommentAt);
  assert.ok(readmeCommentAt > aboutCommentAt);
  assert.ok(emptyPlaybackPitchCommentAt > emptyPlaybackMetaCommentAt);
  assert.ok(emptyPlaybackRulesCommentAt > emptyPlaybackPitchCommentAt);
  assert.ok(aboutCommentAt > emptyPlaybackRulesCommentAt);
  const occupiedHearEmptyPlaybackKeep =
    cssSource.match(
      /\.week-occupied \.opening-listen\[data-hear-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(occupiedHearEmptyPlaybackKeep, /font-weight:\s*700/);
  const emptyLedeEmptyPlaybackKeep =
    cssSource.match(
      /\.week-empty \.lede\[data-first-read="bid"\]\[data-empty-lede-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(emptyLedeEmptyPlaybackKeep, /font-weight:\s*600/);
  const kickerEmptyPlaybackKeep =
    cssSource.match(
      /\.week-empty \.empty-deck \.deck-kicker\[data-empty-kicker\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(kickerEmptyPlaybackKeep, /font-weight:\s*600/);
  const claimEmptyPlaybackKeep =
    cssSource.match(
      /\.week-empty \.claim\.empty-claim-first \.claim-note\[data-empty-claim-window\]\s*\{[^}]+\}/,
    )?.[0] ?? "";
  assert.match(claimEmptyPlaybackKeep, /font-weight:\s*600/);
  assert.doesNotMatch(pageSource, /24h lock/);
  assert.doesNotMatch(cssSource, /hear-after-need-six|need-after-hear-six/);
  assert.doesNotMatch(cssSource, /hear-after-need-N/);
});

