import React from "react";
import { BidForm } from "./outbid-form";
import { CategoryRail, PeriodTabs } from "./home-controls";
import { filterListingsForPeriod, type RankingPeriod } from "./home-view-model";
import { listenClickPath, playbackForListing } from "../core/playback";
import {
  getBoardListings,
  isPaidListing,
  MIN_BID_USD,
  rankListings,
  type RankedListing,
} from "../core/rank";
import { listUnpaid, type UnpaidTrack } from "../core/store";
import { currentWeekUtc, nowUtc } from "../core/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function formatClicks(clicks: number): string {
  return `${clicks} ${clicks === 1 ? "click" : "clicks"}`;
}

function listenHost(listenUrl: string): string {
  try {
    return new URL(listenUrl).hostname.replace(/^www\./, "");
  } catch {
    return "listen source";
  }
}

function parseRankingPeriod(value: string | string[] | undefined): RankingPeriod {
  const requested = Array.isArray(value) ? value[0] : value;
  return requested === "today" ? "today" : "all-time";
}

/** The only opening surface. Empty means no player, no placeholder track, and no fake facts. */
function OpeningDeck({
  listing,
  leftoverUnpaid = false,
}: {
  listing: RankedListing | undefined;
  leftoverUnpaid?: boolean;
}) {
  if (!listing || !isPaidListing(listing)) {
    return (
      <section
        className="studio-deck empty-deck"
        data-slot="empty-card"
        data-empty-week="true"
        data-opening-song="false"
      >
        <div className="empty-deck-mark" aria-hidden="true">#1</div>
        <div className="empty-copy">
          <p className="deck-kicker" data-empty-kicker="">Last 7 days&apos; open</p>
          <h1>No opening song</h1>
          <p className="empty-card-note">Waiting for a paid opening track.</p>
          <p className="deck-note">
            Nobody has paid for the opening position yet.
            {leftoverUnpaid
              ? " An incomplete checkout stays off this desk."
              : ""}
          </p>
        </div>
        <p className="empty-window-note">
          A completed payment claims #1 for the rolling last 7 days, not Monday midnight UTC.
        </p>
      </section>
    );
  }

  const playback = playbackForListing(listing);
  const realPlayback = playback.kind === "embed" ? "embed" : "hop";
  return (
    <section
      className="studio-deck occupied-deck"
      data-opening-song="true"
      data-hear-first="true"
      data-prize-before-price=""
      data-real-playback={realPlayback}
      data-listing-card=""
      data-rank={listing.rank}
      data-id={listing.id}
      data-bid={listing.bidUsd}
    >
      <div className="deck-topline">
        <p className="deck-kicker">On air · opening song</p>
        <span className="deck-rank">#{listing.rank} / bid rank</span>
        <span className="on-air-flag">LIVE OPEN</span>
      </div>
      <h1 className="opening-track" data-prize="">{listing.track}</h1>
      <p className="opening-artist">{listing.artist}</p>
      <div className="opening-playback" data-playback-slot="">
        {playback.kind === "embed" ? (
          <iframe
            id="opening-player"
            className="player"
            title={`${listing.track} official embed`}
            src={playback.embedUrl}
            data-listen-url={playback.listenUrl}
            data-playback="embed"
            data-hear-opening="embed"
            allow="encrypted-media"
          />
        ) : (
          <p className="hop-panel" data-stored-listen="">
            <span className="hop-label">Stored listen source</span>
            <span className="listen-host">{listenHost(listing.listenUrl)}</span>
          </p>
        )}
      </div>
      <a
        className="listen opening-listen"
        href={listenClickPath(listing.id)}
        target="_blank"
        rel="noopener"
        data-listen-url={listing.listenUrl}
        data-first-click="hear"
        data-hear-opening={realPlayback}
      >
        Hear {listing.track}
      </a>
      <p className="opening-facts later-fact" data-later-fact="">
        <span className="bid later-fact" data-bid="" data-later-fact="">{formatUsd(listing.bidUsd)}</span>
        <span className="clicks later-fact" data-clicks="" data-clicks-are-hops="" data-later-fact="">
          {formatClicks(listing.clicks)} / hops
        </span>
        <span className="click-note">our click fact, not a platform count</span>
      </p>
    </section>
  );
}

/** Quiet paid-only rows. The opening deck is the sole #1 presentation. */
function ListingCard({ listing }: { listing: RankedListing }) {
  if (!isPaidListing(listing)) return null;
  const host = listenHost(listing.listenUrl);
  return (
    <article
      className="card later-card"
      data-listing-card=""
      data-later-rank=""
      data-rank={listing.rank}
      data-id={listing.id}
      data-bid={listing.bidUsd}
    >
      <span className="rank">#{listing.rank}</span>
      <div className="card-body">
        <p className="later-track" data-later-track="">{listing.track}</p>
        <p className="artist">{listing.artist}</p>
        <p className="card-listen-row">
          <a
            className="listen later-listen"
            href={listenClickPath(listing.id)}
            target="_blank"
            rel="noopener"
            data-listen-url={listing.listenUrl}
            data-listen-later=""
            data-searchable-listing=""
            data-listing-id={listing.id}
            data-search-track={listing.track}
            data-search-artist={listing.artist}
            data-search-host={host}
            data-search-rank={listing.rank}
          >
            Listen
          </a>
          <span className="listen-host">{host}</span>
        </p>
        <p className="meta">
          <span className="bid" data-bid="">{formatUsd(listing.bidUsd)}</span>
          <span className="clicks" data-clicks="">{formatClicks(listing.clicks)} / hops</span>
        </p>
      </div>
    </article>
  );
}

function Leaderboard({ listings }: { listings: readonly RankedListing[] }) {
  const rest = rankListings(listings).filter((listing) => listing.rank > 1);
  if (rest.length === 0) return null;
  return (
    <section className="queue later-stack" data-later-stack="" aria-labelledby="queue-heading">
      <div className="queue-head">
        <div>
          <p className="queue-kicker">Program log</p>
          <h2 id="queue-heading" data-later-window="">Also last 7 days</h2>
        </div>
        <p>Rank is the bid. These tracks are not the opening song. Clicks are hops.</p>
      </div>
      <ol className="leaderboard later-board" data-slot="later-rows" data-leaderboard="">
        {rest.map((listing) => (
          <li key={listing.id}>
            <ListingCard listing={listing} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Board({
  weekId,
  nextResetAt,
  listings,
  unpaid = [],
  period = "all-time",
}: {
  weekId: string;
  nextResetAt: string;
  listings: readonly RankedListing[];
  unpaid?: readonly UnpaidTrack[];
  period?: RankingPeriod;
}) {
  const paid = rankListings(listings);
  const opening = paid[0];
  const emptyWeek = opening === undefined;
  const leftoverUnpaid = unpaid.length > 0;
  const topBid = opening?.bidUsd ?? 0;
  const defaultAmount = topBid > 0 ? topBid + 1 : MIN_BID_USD;

  return (
    <main
      className={`board station ${emptyWeek ? "week-empty" : "week-occupied"}`}
      data-slot="home-shell"
      data-station-desk=""
      data-station="PH09"
      data-board=""
      data-week={weekId}
      data-week-empty={emptyWeek ? "true" : undefined}
      data-week-occupied={emptyWeek ? undefined : "true"}
      data-empty-bid-five={emptyWeek ? "" : undefined}
      data-unpaid-off={leftoverUnpaid ? "" : undefined}
      data-hear-first={opening ? "true" : "false"}
      data-claim-opening={opening ? "take" : "empty"}
      data-ranking-period={period}
      data-period-scope={period === "today" ? "rolling-24-hours" : "rolling-week"}
    >
      <header className="station-intro">
        <p className="station-call">PH <span>09</span> · Playlist Headline</p>
        <div className="station-intro-row">
          <div>
            {opening ? (
              <p className="lede" data-hear-first="true" data-first-read="hear" data-occupied-window="">
                Last 7 days&apos; opening song is on. Rank is the bid. Playback is real.
              </p>
            ) : (
              <p className="lede" data-first-read="bid" data-empty-lede-window="">
                Bid USD. Open last 7 days. Listeners hear you first. Rank is the bid.
              </p>
            )}
            <p
              className="period-meta"
              data-week-id={weekId}
              data-next-reset={nextResetAt}
              data-rolling-week=""
            >
              Rolling last 7 days. Not Monday 00:00 UTC.
            </p>
          </div>
          <PeriodTabs className="station-period" initialPeriod={period} />
        </div>
      </header>

      <div className="station-desk" data-hear-first={opening ? "true" : "false"}>
        <OpeningDeck listing={opening} leftoverUnpaid={leftoverUnpaid} />
        <aside
          className="claim-rail"
          id="claim-rail"
          aria-labelledby="claim-heading"
          data-claim-opening={opening ? "take" : "empty"}
        >
          <p id="claim-heading" className="rail-kicker">Claim the open</p>
          {opening ? (
            <p className="claim-raise" data-claim-raise="">
              <a href="#claim" className="claim-raise-link">Need {formatUsd(defaultAmount)} to take #1</a>
              <span className="claim-raise-note">Same listen URL pays only the difference.</span>
            </p>
          ) : null}
          <BidForm
            defaultAmount={defaultAmount}
            topBidUsd={opening?.bidUsd}
            unpaidOff={leftoverUnpaid}
          />
        </aside>
      </div>

      <div className="semantic-contract sr-only">
        <p data-period-view={period}>
          {period === "today"
            ? "Today shows paid placements from the last 24 hours."
            : "All-time shows paid placements in the rolling last 7 days."}
        </p>
        {opening ? (
          <>
            <p data-hear-window="" data-occupied-window="">Hear the paid #1 opening song first.</p>
            <p data-claim-raise="">Need {formatUsd(defaultAmount)} to take #1. Same listen URL pays only the difference.</p>
          </>
        ) : (
          <p data-empty-window="">There is no player last 7 days. A completed payment claims #1.</p>
        )}
      </div>

      <CategoryRail />
      <Leaderboard listings={paid} />
    </main>
  );
}

type HomePageProps = {
  searchParams?: Promise<{ period?: string | string[] | undefined }>;
};

async function HomePage({ searchParams }: HomePageProps = {}) {
  const params = (await searchParams) ?? {};
  const period = parseRankingPeriod(params.period);
  const now = nowUtc();
  const week = currentWeekUtc(now);
  const ranked = rankListings(getBoardListings(now));
  const listings = filterListingsForPeriod(ranked, period, now.toISOString());
  const unpaid = listUnpaid(week.weekId);
  return (
    <Board
      weekId={week.weekId}
      nextResetAt={week.nextResetAt.toISOString()}
      listings={listings}
      unpaid={unpaid}
      period={period}
    />
  );
}

export default Object.assign(HomePage, {
  Board,
  ListingCard,
  Leaderboard,
  OpeningDeck,
  formatUsd,
  formatClicks,
});
