import React from "react";
import { BidForm } from "./outbid-form";
import { listenClickPath, playbackForListing } from "../core/playback";
import {
  getBoardListings,
  MIN_BID_USD,
  rankListings,
  type RankedListing,
} from "../core/rank";
import { currentWeekUtc } from "../core/week";

export const dynamic = "force-dynamic";

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

export function formatClicks(clicks: number): string {
  return `${clicks} ${clicks === 1 ? "click" : "clicks"}`;
}

function listenHost(listenUrl: string): string {
  try {
    return new URL(listenUrl).hostname.replace(/^www\./, "");
  } catch {
    return "listen";
  }
}

export function ListingCard({ listing }: { listing: RankedListing }) {
  return (
    <article
      className="card"
      data-listing-card=""
      data-rank={listing.rank}
      data-id={listing.id}
      data-bid={listing.bidUsd}
    >
      <span className="rank">#{listing.rank}</span>
      <div className="card-body">
        <p className="card-cue">Cue {listing.rank}</p>
        <h3 className="track">{listing.track}</h3>
        <p className="artist">{listing.artist}</p>
        <p className="card-listen-row">
          <a
            className="listen"
            href={listenClickPath(listing.id)}
            data-listen-url={listing.listenUrl}
          >
            Listen
          </a>
          <span className="listen-host">{listenHost(listing.listenUrl)}</span>
        </p>
        <p className="meta">
          <span className="bid" data-bid="">
            {formatUsd(listing.bidUsd)}
          </span>
          <span className="clicks" data-clicks="">
            {formatClicks(listing.clicks)}
          </span>
        </p>
      </div>
    </article>
  );
}

export function Leaderboard({
  listings,
}: {
  listings: readonly RankedListing[];
}) {
  const rest = listings.filter((listing) => listing.rank > 1);
  if (rest.length === 0) {
    return null;
  }

  return (
    <aside className="queue" aria-labelledby="queue-heading">
      <div className="queue-head">
        <h2 id="queue-heading">Also this week</h2>
        <p>
          Rank is the bid. These tracks are not the opening song. Clicks are
          hops, not a platform count.
        </p>
      </div>
      <ol className="leaderboard" data-leaderboard="">
        {rest.map((listing) => (
          <li key={listing.id}>
            <ListingCard listing={listing} />
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function OpeningDeck({
  listing,
}: {
  listing: RankedListing | undefined;
}) {
  if (!listing) {
    return (
      <section
        className="studio-deck empty-deck"
        data-empty-week="true"
        data-opening-song="false"
      >
        <p className="deck-kicker">This week&apos;s open</p>
        <h1>No opening song</h1>
        <p className="empty">
          No opening song this week. Nobody has paid yet. We do not invent a
          track or a stream.
        </p>
        <p className="deck-note">
          The studio stays dark until a completed payment claims #1. There is
          no player on an empty week.
        </p>
      </section>
    );
  }

  const playback = playbackForListing(listing);

  return (
    <section
      className="studio-deck"
      data-opening-song="true"
      data-listing-card=""
      data-rank={listing.rank}
      data-id={listing.id}
      data-bid={listing.bidUsd}
    >
      <p className="deck-kicker">On air · opening song</p>
      <p className="on-air-flag">LIVE OPEN</p>
      <h1 className="opening-track">{listing.track}</h1>
      <p className="opening-artist">{listing.artist}</p>
      <p className="opening-facts">
        <span className="bid" data-bid="">
          {formatUsd(listing.bidUsd)}
        </span>
        <span className="clicks" data-clicks="">
          {formatClicks(listing.clicks)}
        </span>
      </p>
      <a
        className="listen opening-listen"
        href={listenClickPath(listing.id)}
        data-listen-url={listing.listenUrl}
      >
        Listen
      </a>
      {playback.kind === "embed" ? (
        <iframe
          className="player"
          title={`${listing.track} official embed`}
          src={playback.embedUrl}
          data-listen-url={playback.listenUrl}
          data-playback="embed"
          allow="encrypted-media"
        />
      ) : (
        <p className="redirect-note">
          Official embed is not available for this host. Listen hops to the
          stored URL.
        </p>
      )}
    </section>
  );
}

export function Board({
  weekId,
  nextResetAt,
  listings,
}: {
  weekId: string;
  nextResetAt: string;
  listings: readonly RankedListing[];
}) {
  const opening = listings[0];
  const topBid = opening?.bidUsd ?? 0;
  const defaultAmount = topBid > 0 ? topBid + 1 : MIN_BID_USD;

  return (
    <main className="board station" data-board="" data-week={weekId}>
      <p className="station-call">
        PH <span>09</span> · Playlist Headline
      </p>
      <p className="lede">
        Bid USD. Open the week. Listeners hear you first. Rank is the bid.
        Playback is real.
      </p>
      <p className="period-meta" data-week-id={weekId} data-next-reset={nextResetAt}>
        Week {weekId}. Next reset {nextResetAt}.
      </p>
      <div className="station-desk">
        <OpeningDeck listing={opening} />
        <aside className="claim-rail" aria-labelledby="claim-heading">
          <p id="claim-heading" className="rail-kicker">
            Claim the open
          </p>
          <BidForm defaultAmount={defaultAmount} />
        </aside>
      </div>
      <Leaderboard listings={listings} />
    </main>
  );
}

export default function HomePage() {
  const week = currentWeekUtc();
  const listings = rankListings(getBoardListings(week.weekId));
  return (
    <Board
      weekId={week.weekId}
      nextResetAt={week.nextResetAt.toISOString()}
      listings={listings}
    />
  );
}
