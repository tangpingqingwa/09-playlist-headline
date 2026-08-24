import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Board } from "../src/app/page";
import { rankListings, type Listing } from "../src/core/rank";

const WEEK = "2026-W34";
const NEXT_RESET = "2026-08-24T00:00:00.000Z";
const root = process.cwd();
const pageSource = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");
const cssSource = readFileSync(join(root, "src", "app", "board.css"), "utf8");
const formSource = readFileSync(join(root, "src", "app", "outbid-form.tsx"), "utf8");
const layoutSource = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");

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

  assert.match(empty, /class="board station"/);
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
  assert.match(html, /There is no player this week/);
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
  assert.match(html, /Hear this week/);
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
  assert.match(html, /<h1 class="opening-track">Cold Open<\/h1>/);
  assert.match(html, /data-id="lst_open"/);
  assert.match(html, /data-id="lst_two"/);
  assert.match(html, /Also this week/);
  assert.match(html, /These tracks are not the opening song/);
  assert.equal((html.match(/data-id="lst_open"/g) ?? []).length, 1);
  assert.equal((html.match(/Cold Open/g) ?? []).length, 1);
  assert.doesNotMatch(html, /This week&apos;s board/);
  assert.doesNotMatch(html, /<h3 class="track">Cold Open<\/h3>/);
  assert.match(html, /<h3 class="track">Second Slot<\/h3>/);
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
  assert.match(solo, /<h1 class="opening-track">Only Open<\/h1>/);
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
  assert.match(html, /<h1 class="opening-track">Cold Open<\/h1>/);
  assert.match(html, /<p class="opening-artist">Ada<\/p>/);
  assert.match(html, /href="\/click\/lst_generic"/);
  assert.match(html, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(html, /1 click</);
  assert.doesNotMatch(html, /data-leaderboard/);
  assert.doesNotMatch(html, /<h3 class="track">Cold Open<\/h3>/);
  assert.match(html, /Hear this week/);
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
  assert.match(embed, /Hear this week/);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /href="\/click\/lst_hop"/);
  assert.match(hop, /data-first-click="hear"/);
  assert.match(hop, /example.com/);
  assert.equal((hop.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
  assert.doesNotMatch(hop, /<iframe/);
  assert.doesNotMatch(hop, /data-playback=/);
  assert.doesNotMatch(hop, /Official embed is not available/);
  assert.doesNotMatch(hop, FORBIDDEN);

  const empty = renderBoard([]);
  assert.doesNotMatch(empty, /data-hear-opening=/);
  assert.doesNotMatch(empty, /Hear this week/);
  assert.doesNotMatch(empty, /<iframe/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("first-time artist claiming the opening song is certain on the claim rail", () => {
  const empty = renderBoard([]);
  assert.match(empty, /data-claim-opening="empty"/);
  assert.match(empty, /data-claim-note="empty"/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.doesNotMatch(occupied, /\$5 claims this week/);
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
  const openingTrack = hop.indexOf('<h1 class="opening-track">Cold Open</h1>');
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
  assert.match(hop, /Hear this week/);
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
  assert.ok(embedFirstClick < embedRaise);
  assert.ok(embedRaise < embedHear);
  assert.ok(embedRaise < embedClaim);
  assert.equal((embed.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.match(embed, /Need \$13 to take #1/);
  assert.match(embed, /Hear this week/);
  assert.match(embed, /href="#hear-opening"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-raise-after-hear/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /data-hear-after-raise/);
  assert.doesNotMatch(empty, /href="#claim"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.match(hop, /Hear this week/);
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
  assert.match(empty, /\$5 claims this week/);
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
  assert.match(hop, /Hear this week/);
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
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(hop, /href="\/click\/lst_open"/);
  assert.match(hop, /data-listen-url="https:\/\/example.com\/cold-open"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /Hear this week/);
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
  assert.ok(embed.indexOf('data-first-click="hear"') < embedRaiseNote);
  assert.ok(embedRaiseNote < embedHear);
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
  assert.match(empty, /\$5 claims this week/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, /Hear this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
  assert.equal((hop.match(/href="\/click\/lst_open"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(hop, /data-hear-one-first="true"/);
  assert.match(hop, /Hear this week/);
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
  assert.ok(embedOne < embedRaise);
  assert.ok(embedRaise < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
  assert.equal((hop.match(/data-raise-after-hear="true"/g) ?? []).length, 1);
  assert.equal((hop.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((hop.match(/Need \$13 to take #1/g) ?? []).length, 2);
  assert.match(hop, /data-need-after-hear="true"/);
  assert.match(hop, /class="need-after-hear(?: need-after-hear-two(?: need-after-hear-three(?: need-after-hear-four(?: need-after-hear-five)?)?)?)?"/);
  assert.match(hop, /Need \$13 to take #1/);
  assert.match(hop, /Same listen URL pays only the difference/);
  assert.match(hop, /href="#claim"/);
  assert.match(hop, /data-hear-one-first="true"/);
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const hearRule = cssSource.match(/\.opening-listen \{[^}]+\}/);
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
  assert.ok(embedNeed < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const hearRule = cssSource.match(/\.opening-listen \{[^}]+\}/);
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
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
  assert.ok(embedNeed < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
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
  assert.ok(embedNeedTwo < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
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
  assert.ok(embedNeedTwo < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
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
  assert.ok(embedNeedThree < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
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
  assert.ok(embedNeedThree < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
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
  assert.ok(embedNeedFour < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFourRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{\n  min-height: 3\.65rem;[\s\S]*?\n\}/m,
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
  assert.ok(embedNeedFour < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const needFiveRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four\.need-after-hear-five \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFourRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{\n  min-height: 3\.65rem;[\s\S]*?\n\}/m,
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
  assert.ok(embedNeedFive < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
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
  assert.equal((hop.match(/Hear this week/g) ?? []).length, 1);
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
  assert.match(hop, /Hear this week/);
  assert.match(hop, /Claim #1 for/);
  assert.match(hop, />Outbid</);
  assert.match(hop, /class="station-desk"/);
  const needRule = cssSource.match(/\.need-after-hear \{[^}]+\}/);
  const needTwoRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two \{\n  min-height: 2\.45rem;[\s\S]*?\n\}/m,
  );
  const needThreeRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three \{\n  min-height: 2\.75rem;[\s\S]*?\n\}/m,
  );
  const needFourRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const needFiveRule = cssSource.match(
    /^\.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four\.need-after-hear-five \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedRule = cssSource.match(
    /^\.opening-listen\.hear-after-need \{[^}]+\}/m,
  );
  const hearAfterNeedTwoRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two \{\n  min-height: 3\.05rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedThreeRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{\n  min-height: 3\.35rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFourRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{\n  min-height: 3\.65rem;[\s\S]*?\n\}/m,
  );
  const hearAfterNeedFiveRule = cssSource.match(
    /^\.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four\.hear-after-need-five \{\n  min-height: 3\.95rem;[\s\S]*?\n\}/m,
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
  assert.ok(embedNeedFive < embedHear);
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
  assert.doesNotMatch(empty, /Hear this week/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /\$5 claims this week/);
  assert.match(empty, /Claim #1 for/);
  assert.doesNotMatch(empty, FORBIDDEN);
});
