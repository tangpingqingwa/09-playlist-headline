import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../src/app/page";
import {
  applyThemeToDocument,
  CATEGORY_OPTIONS,
  matchSearchListings,
  periodFromSearch,
  readSearchListings,
} from "../src/app/home-controls";
import { filterListingsForPeriod, type RankingPeriod } from "../src/app/home-view-model";
import type { SearchListing } from "../src/app/home-controls";
import { rankListings, type Listing } from "../src/core/rank";
import type { UnpaidTrack } from "../src/core/store";

const WEEK = "2026-W34";
const NEXT_RESET = "2026-08-24T00:00:00.000Z";
const root = process.cwd();
const { Board, ListingCard } = HomePage;
const layoutSource = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");
const pageSource = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");
const controlsSource = readFileSync(join(root, "src", "app", "home-controls.tsx"), "utf8");
const cssSource = readFileSync(join(root, "src", "app", "board.css"), "utf8");
const formSource = readFileSync(join(root, "src", "app", "outbid-form.tsx"), "utf8");

const FORBIDDEN =
  /play count|stream count|monthly listeners|1\.2M streams|fake stream|<audio|waveform/i;
const REFERENCE_RESIDUE = /outbid-reference-root|DTC Picks Daily|picks\.daily|see\.io|tutti\.so|joni\.ai/i;
const OBSOLETE_HOPS = new RegExp([
  ["hear", "after", "need"].join("-"),
  ["need", "after", "hear"].join("-"),
  ["raise", "after", "hear"].join("-"),
].join("|"), "i");
const OBSOLETE_COPY = ["Then", "the", "listen", "URL"].join(" ");

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

function renderBoard(
  listings: Listing[],
  unpaid: UnpaidTrack[] = [],
  period: RankingPeriod = "all-time",
): string {
  return renderToStaticMarkup(
    createElement(Board, {
      weekId: WEEK,
      nextResetAt: NEXT_RESET,
      listings: rankListings(listings),
      unpaid,
      period,
    }),
  );
}

function renderDocument(
  listings: Listing[],
  unpaid: UnpaidTrack[] = [],
  period: RankingPeriod = "all-time",
): string {
  return renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(Board, {
        weekId: WEEK,
        nextResetAt: NEXT_RESET,
        listings: rankListings(listings),
        unpaid,
        period,
      }),
    ),
  );
}

test("homepage shell keeps the target hierarchy and original identity", () => {
  const empty = renderBoard([]);
  assert.match(layoutSource, /className="site-header"/);
  assert.match(layoutSource, /className="site-nav"/);
  assert.match(layoutSource, /className="header-station-call"/);
  assert.match(layoutSource, /PH09 \/ ON AIR DESK/);
  assert.match(layoutSource, /playlist\.headline/);
  assert.match(layoutSource, /href="\/about"/);
  assert.match(layoutSource, /href="\/rules"/);
  assert.match(layoutSource, /<SearchToggle \/>/);
  assert.match(layoutSource, /<ThemeToggle \/>/);
  assert.doesNotMatch(layoutSource, /fonts\.googleapis|fonts\.gstatic/);

  const stationCall = empty.indexOf('class="station-call"');
  const desk = empty.indexOf('class="station-desk"');
  const lanes = empty.indexOf('data-slot="category-rail"');
  assert.ok(stationCall >= 0 && stationCall < desk && desk < lanes);
  assert.match(empty, /class="board station week-empty"/);
  assert.match(empty, /data-slot="home-shell"/);
  assert.match(empty, /data-station-desk=""/);
  assert.match(empty, /class="studio-deck empty-deck"/);
  assert.match(empty, /class="claim-rail"/);
  assert.match(empty, /class="category-rail"/);
  assert.match(empty, /Program index/);
  assert.doesNotMatch(empty, REFERENCE_RESIDUE);
});

test("empty board is honest, paid-only, and keeps the native claim contract", () => {
  const empty = renderBoard([]);
  assert.match(empty, /data-empty-week="true"/);
  assert.match(empty, /data-opening-song="false"/);
  assert.match(empty, /data-claim-opening="empty"/);
  assert.match(empty, /No opening song/);
  assert.match(empty, /Waiting for a paid opening track/);
  assert.match(empty, /Claim #1 for/);
  assert.match(empty, /name="amountUsd"/);
  assert.match(empty, /name="listenUrl"/);
  assert.match(empty, /name="track"/);
  assert.match(empty, /name="artist"/);
  assert.match(empty, />Claim rank</);
  assert.match(empty, /aria-label="Claim rank"/);
  assert.match(empty, /data-amount-decrease/);
  assert.match(empty, /data-amount-increase/);
  assert.match(empty, /data-claim-submit/);
  assert.match(empty, /data-first-click="claim"/);
  assert.doesNotMatch(empty, /data-opening-song="true"/);
  assert.doesNotMatch(empty, /data-listing-card/);
  assert.doesNotMatch(empty, /data-listen-url/);
  assert.doesNotMatch(empty, /data-first-click="hear"/);
  assert.doesNotMatch(empty, /<iframe|<audio|data-playback=/);
  assert.doesNotMatch(empty, FORBIDDEN);
});

test("occupied board leads with one opening deck and one later roster", () => {
  const html = renderBoard([
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
      bidUsd: 9,
      clicks: 2,
      firstPaidAt: "2026-08-18T00:00:00.000Z",
    }),
    listing({
      id: "lst_three",
      track: "Third Slot",
      artist: "Cy",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 7,
      clicks: 1,
      firstPaidAt: "2026-08-19T00:00:00.000Z",
    }),
    listing({
      id: "lst_four",
      track: "Later Slot",
      artist: "Dee",
      listenUrl: "https://example.com/later-slot",
      bidUsd: 6,
      firstPaidAt: "2026-08-20T00:00:00.000Z",
    }),
  ]);

  assert.equal((html.match(/class="studio-deck occupied-deck"/g) ?? []).length, 1);
  assert.equal((html.match(/class="card later-card"/g) ?? []).length, 3);
  assert.equal((html.match(/data-first-click="hear"/g) ?? []).length, 1);
  assert.match(html, /data-opening-song="true"/);
  assert.match(html, /data-rank="1"/);
  assert.match(html, /Cold Open/);
  assert.match(html, /Ada/);
  assert.match(html, /href="\/click\/lst_open"/);
  assert.match(html, /data-listen-url="https:\/\/example\.com\/cold-open"/);
  assert.match(html, /\$12/);
  assert.match(html, /4 clicks/);
  assert.match(html, /Also last 7 days/);
  assert.match(html, /Second Slot/);
  assert.match(html, /Third Slot/);
  assert.match(html, /Later Slot/);
  assert.doesNotMatch(html, /highlight-card|secondary-section|activity-section/);
  assert.doesNotMatch(html, REFERENCE_RESIDUE);
  assert.doesNotMatch(html, FORBIDDEN);
});

test("real playback contracts keep embeds, stored URLs, and counted click redirects", () => {
  const embed = renderBoard([
    listing({
      id: "lst_embed",
      track: "Cold Open",
      listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bidUsd: 12,
    }),
  ]);
  assert.match(embed, /data-real-playback="embed"/);
  assert.match(embed, /data-playback="embed"/);
  assert.match(embed, /src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(embed, /href="\/click\/lst_embed"/);
  assert.equal((embed.match(/<iframe/g) ?? []).length, 1);

  const redirect = renderBoard([
    listing({ id: "lst_generic", listenUrl: "https://example.com/cold-open", clicks: 1 }),
  ]);
  assert.match(redirect, /data-real-playback="hop"/);
  assert.match(redirect, /data-stored-listen=""/);
  assert.match(redirect, /data-hear-opening="hop"/);
  assert.match(redirect, /data-listen-url="https:\/\/example\.com\/cold-open"/);
  assert.equal((redirect.match(/href="\/click\/lst_generic"/g) ?? []).length, 1);
  assert.doesNotMatch(redirect, /<iframe|data-playback=/);
  assert.doesNotMatch(redirect, FORBIDDEN);
});

test("unpaid checkout drafts stay off the occupied cards and empty opening", () => {
  const ghost = listing({
    id: "lst_ghost",
    track: "Ghost Track",
    artist: "Vapor",
    listenUrl: "https://example.com/ghost",
    bidUsd: 99,
    firstPaidAt: "",
    lastPaidAt: "",
  });
  assert.deepEqual(rankListings([ghost]), []);
  assert.equal(
    renderToStaticMarkup(createElement(ListingCard, { listing: { ...ghost, rank: 1 } })),
    "",
  );

  const html = renderBoard([], [
    {
      sessionId: "fix_unpaid",
      weekId: WEEK,
      track: ghost.track,
      artist: ghost.artist,
      listenUrl: ghost.listenUrl,
      bidUsd: ghost.bidUsd,
    },
  ]);
  assert.match(html, /data-unpaid-off=""/);
  assert.match(html, /An incomplete checkout stays off this desk/);
  assert.match(html, /An incomplete or abandoned checkout stays off this desk/);
  assert.doesNotMatch(html, /Ghost Track|Vapor|lst_ghost|\$99/);
  assert.doesNotMatch(html, /data-opening-song="true"|data-listing-card|data-first-click="hear"/);
  assert.doesNotMatch(html, FORBIDDEN);
});

test("rolling-window and click facts remain explicit in both board states", () => {
  const empty = renderBoard([]);
  const occupied = renderBoard([
    listing({ id: "lst_open", listenUrl: "https://example.com/cold-open" }),
  ]);
  assert.match(empty, /Last 7 days/);
  assert.match(empty, /There is no player last 7 days/);
  assert.match(empty, /data-empty-window/);
  assert.match(occupied, /Last 7 days&#x27; opening song is on/);
  assert.match(occupied, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.match(occupied, /data-rolling-week/);
  assert.match(occupied, /data-claim-raise/);
  assert.match(occupied, /Same listen URL pays only the difference/);
  assert.doesNotMatch(empty, /visitor|online/);
  assert.doesNotMatch(occupied, /visitor|online/);
});

test("controls expose finite keyboard-friendly states without new routes", () => {
  const empty = renderBoard([]);
  assert.match(controlsSource, /role="tablist"/);
  assert.match(controlsSource, /data-period="all-time"/);
  assert.match(controlsSource, /data-period="today"/);
  assert.match(controlsSource, /aria-selected=\{period === "all-time"\}/);
  assert.match(empty, /data-category-nav/);
  assert.match(empty, /aria-label="Music program lanes"/);
  assert.match(empty, /data-category-more/);
  assert.match(empty, /Program index/);
  assert.match(empty, /Ambient \/ Field/);
  assert.match(empty, /Beats \/ Electronic/);
  assert.match(empty, /data-amount-decrease/);
  assert.match(empty, /data-amount-increase/);
  assert.equal(CATEGORY_OPTIONS.length, 10);
  assert.equal(CATEGORY_OPTIONS[0]?.label, "Ambient / Field");
  assert.doesNotMatch(controlsSource, /AI Systems|Search & Discovery|Digital Assets|Developer Tools/);
  assert.doesNotMatch(layoutSource, /href="\/(daily|category|product)/);
});

test("responsive period control has one canonical tablist in the rendered document", () => {
  const document = renderDocument([]);
  const forms = [...document.matchAll(/<form\b[^>]*class="[^"]*period-tabs[^"]*"[^>]*>/g)];
  assert.equal(forms.length, 1);
  assert.match(document, /data-slot="period-tabs"/);
  assert.match(document, /role="tablist"/);
  assert.match(document, /data-ranking-period="all-time"/);
  assert.match(document, /data-period-scope="rolling-week"/);
  assert.doesNotMatch(document, /mobile-period-controls/);

  const todayDocument = renderDocument([], [], "today");
  assert.match(todayDocument, /data-ranking-period="today"/);
  assert.match(todayDocument, /data-period-scope="rolling-24-hours"/);
});

test("header navigation uses existing period state and focuses the real category rail", () => {
  assert.match(layoutSource, /data-period-nav="today"/);
  assert.match(layoutSource, /href="\/?\?period=today"/);
  assert.match(layoutSource, /data-category-nav-link/);
  assert.match(layoutSource, /href="#categories"/);
  assert.match(controlsSource, /id="categories"/);
  assert.match(controlsSource, /tabIndex=\{-1\}/);
  assert.match(cssSource, /scroll-margin-top:\s*92px/);
});

test("shared homepage geometry keeps the PH09 desk aligned at both viewports", () => {
  assert.match(cssSource, /--paper:\s*#f6f1e2/);
  assert.match(cssSource, /--oxblood:\s*#b42318/);
  assert.match(cssSource, /--serif:\s*"Newsreader"/);
  assert.match(cssSource, /--mono:\s*"IBM Plex Mono"/);
  assert.match(cssSource, /\.station-desk\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(18rem, 0\.85fr\)/s);
  assert.match(cssSource, /\.studio-deck::before\s*\{[^}]*border:\s*1px dashed var\(--line-strong\)/s);
  assert.match(cssSource, /\.amount-field\s*\{[^}]*border-bottom:\s*0/s);
  assert.match(cssSource, /\.opening-playback\s*\{[^}]*min-height:\s*142px/s);
  assert.match(cssSource, /\.later-board > li\s*\{[^}]*border-top:\s*1px dashed/s);
  const mobile = cssSource.slice(cssSource.indexOf("@media (max-width: 640px)"));
  assert.match(mobile, /\.station-desk\s*\{[^}]*gap:\s*14px/s);
  assert.match(mobile, /\.listing-fields\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(cssSource, /\.category-rail-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(mobile, /\.later-card\s*\{[^}]*grid-template-columns:\s*42px minmax\(0, 1fr\)/s);
  assert.match(cssSource, /@media \(max-width: 860px\)/);
});

test("period controls restore from the URL and filter real paid rows", () => {
  const now = "2026-08-28T12:00:00.000Z";
  const rows = [
    listing({
      id: "today-row",
      listenUrl: "https://example.com/today",
      firstPaidAt: "2026-08-28T08:00:00.000Z",
      bidUsd: 8,
    }),
    listing({
      id: "older-row",
      listenUrl: "https://example.com/older",
      firstPaidAt: "2026-08-26T08:00:00.000Z",
      bidUsd: 20,
    }),
  ];
  const ranked = rankListings(rows);
  assert.equal(periodFromSearch("?period=today"), "today");
  assert.equal(periodFromSearch("?period=all-time"), "all-time");
  assert.deepEqual(filterListingsForPeriod(ranked, "today", now).map((row) => row.id), ["today-row"]);
  const today = renderDocument(filterListingsForPeriod(ranked, "today", now), [], "today");
  assert.match(today, /data-ranking-period="today"/);
  assert.match(today, /data-period-scope="rolling-24-hours"/);
  assert.match(controlsSource, /method="get"/);
  assert.match(controlsSource, /name="period"/);
});

test("search is limited to current paid rows and returns their existing click links", () => {
  const rows: SearchListing[] = [
    { id: "paid-one", track: "Midnight Frequency", artist: "Signal Studio", host: "open.spotify.com", rank: "1", href: "/click/paid-one" },
    { id: "paid-two", track: "Night Drive", artist: "Canvas Radio", host: "open.spotify.com", rank: "2", href: "/click/paid-two" },
  ];
  assert.deepEqual(matchSearchListings(rows, "midnight"), [rows[0]]);
  assert.deepEqual(matchSearchListings(rows, "canvas spotify"), [rows[1]]);
  assert.deepEqual(matchSearchListings(rows, "missing"), []);
  assert.deepEqual(matchSearchListings(rows, ""), rows);
  const fakeRoot = {
    querySelectorAll: () => [
      { dataset: { listingId: "paid-one", searchTrack: "Midnight Frequency", searchArtist: "Signal Studio", searchHost: "open.spotify.com", searchRank: "1" }, getAttribute: () => "/click/paid-one" },
      { dataset: { listingId: "paid-one", searchTrack: "Midnight Frequency", searchArtist: "Signal Studio", searchHost: "open.spotify.com", searchRank: "1" }, getAttribute: () => "/click/paid-one" },
      { dataset: { listingId: "not-a-click", searchTrack: "Not a paid row" }, getAttribute: () => "/about" },
    ],
  } as unknown as ParentNode;
  assert.deepEqual(readSearchListings(fakeRoot), [rows[0]]);
  const occupied = renderBoard([
    listing({ id: "paid-two", track: "Night Drive", artist: "Canvas Radio", listenUrl: "https://open.spotify.com/track/paid-two", bidUsd: 12 }),
    listing({ id: "paid-one", track: "Midnight Frequency", artist: "Signal Studio", listenUrl: "https://open.spotify.com/track/paid-one", bidUsd: 10 }),
  ]);
  assert.match(occupied, /data-searchable-listing=""/);
  assert.match(occupied, /data-search-track="Midnight Frequency"/);
  assert.match(occupied, /href="\/click\/paid-one"/);
  assert.match(controlsSource, /data-search-results/);
  assert.match(controlsSource, /data-search-empty/);
  assert.match(controlsSource, /data-search-close/);
  assert.match(controlsSource, /focusListing\(listing\.id\)/);
});

test("theme synchronization is reversible and updates document classes and color scheme", () => {
  function classList() {
    const tokens = new Set<string>();
    return {
      tokens,
      toggle(token: string, force?: boolean) {
        if (force === true || (force === undefined && !tokens.has(token))) tokens.add(token);
        else if (force === false || tokens.has(token)) tokens.delete(token);
      },
    };
  }
  const rootClasses = classList();
  const bodyClasses = classList();
  const fakeDocument = {
    documentElement: { classList: rootClasses, style: { colorScheme: "" } },
    body: { classList: bodyClasses },
  } as unknown as Document;
  applyThemeToDocument(true, fakeDocument);
  assert.equal(rootClasses.tokens.has("dark"), true);
  assert.equal(bodyClasses.tokens.has("dark"), true);
  assert.equal(fakeDocument.documentElement.style.colorScheme, "dark");
  applyThemeToDocument(false, fakeDocument);
  assert.equal(rootClasses.tokens.has("dark"), false);
  assert.equal(bodyClasses.tokens.has("dark"), false);
  assert.equal(fakeDocument.documentElement.style.colorScheme, "light");
  assert.match(controlsSource, /localStorage\.setItem\("playlist-headline-theme"/);
  assert.match(controlsSource, /aria-pressed=\{dark\}/);
});

test("focus, hover, disabled, and dark tokens are present in the visual skin", () => {
  assert.match(cssSource, /a:focus-visible,[\s\S]*?outline:\s*2px solid var\(--oxblood\)/);
  assert.match(cssSource, /outline-offset:\s*3px/);
  assert.match(cssSource, /\.listing-fields input:focus\s*\{[^}]*border-color:\s*var\(--oxblood\)/s);
  assert.match(cssSource, /\.claim-submit:hover\s*\{[^}]*background:\s*var\(--oxblood-dark\)/s);
  assert.match(cssSource, /html\.dark,[\s\S]*?body\.dark\s*\{/);
  assert.match(controlsSource, /classList\.toggle\("dark"/);
});

test("claim rail keeps the amount controls compact, centered, and bare-URL friendly", () => {
  assert.match(formSource, /style=\{\{ width: `\$\{Math\.max\(2, String\(amount\)\.length\)\}ch` \}\}/);
  assert.match(formSource, /name="listenUrl"[\s\S]*?type="text"[\s\S]*?inputMode="url"/);
  assert.match(cssSource, /\.claim-heading\s*\{[^}]*justify-content:\s*center/s);
  assert.match(cssSource, /\.amount-stepper\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(cssSource, /\.amount-field input\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*2ch;[^}]*max-width:\s*6ch/s);
});

test("homepage source has no obsolete hop copy or invented media facts", () => {
  for (const source of [pageSource, cssSource, formSource]) {
    assert.doesNotMatch(source, OBSOLETE_HOPS);
    assert.doesNotMatch(source, new RegExp(OBSOLETE_COPY, "i"));
    assert.doesNotMatch(source, FORBIDDEN);
  }
  assert.doesNotMatch(pageSource, /OutbidReferenceFixturePage|renderBoardPage|OUTBID_REFERENCE_FIXTURE_ROWS/);
  assert.doesNotMatch(renderBoard([]), REFERENCE_RESIDUE);
});

test("homepage controls use labels instead of decorative character icons or fake media", () => {
  const decorativeCharacters = /[≡♕●⌕☾◎⌄⊞✦⚑₿‹›⚖♢♡♧☼＄♨◈◒↗⌇⌖▣]/;
  for (const source of [layoutSource, pageSource, controlsSource, formSource, cssSource]) {
    assert.doesNotMatch(source, decorativeCharacters);
  }
  const empty = renderBoard([]);
  assert.doesNotMatch(empty, decorativeCharacters);
  assert.match(empty, /class="studio-deck empty-deck"/);
  assert.match(empty, /class="claim-rail"/);
});
