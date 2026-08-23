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
  assert.match(embed, /href="#opening"/);
  assert.match(embed, /id="opening"/);
  assert.match(embed, /Need \$13 to take #1/);
  assert.equal((embed.match(/data-hear-opening=/g) ?? []).length, 1);
  assert.equal((embed.match(/data-hear-after-raise="true"/g) ?? []).length, 1);
  assert.doesNotMatch(embed, /data-hear-opening="hop"/);
  assert.doesNotMatch(embed, FORBIDDEN);

  assert.doesNotMatch(empty, /data-hear-after-raise/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /href="#opening"/);
  assert.doesNotMatch(empty, /Need \$/);
  assert.match(empty, /Bid USD/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /\$5 claims this week/);
  assert.doesNotMatch(empty, FORBIDDEN);
});
