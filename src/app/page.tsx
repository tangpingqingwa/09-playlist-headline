import React from "react";
import { BidForm } from "./outbid-form";
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
        <div className="card-top">
          <h3 className="track">{listing.track}</h3>
          <p className="bid" data-bid="">
            {formatUsd(listing.bidUsd)}
          </p>
        </div>
        <p className="artist">{listing.artist}</p>
        <p className="meta">
          <span className="clicks" data-clicks="">
            {formatClicks(listing.clicks)}
          </span>
          <a
            className="listen"
            href={listing.listenUrl}
            data-listen-url={listing.listenUrl}
          >
            Listen
          </a>
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
  if (listings.length === 0) {
    return null;
  }

  return (
    <ol className="leaderboard" data-leaderboard="">
      {listings.map((listing) => (
        <li key={listing.id}>
          <ListingCard listing={listing} />
        </li>
      ))}
    </ol>
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
    <main className="board" data-board="" data-week={weekId}>
      <h1>Playlist Headline</h1>
      <p className="lede">
        Bid USD. Open the week. Listeners hear you first. Rank is the bid.
        Playback is real.
      </p>
      <p className="period-meta" data-week-id={weekId} data-next-reset={nextResetAt}>
        Week {weekId}. Next reset {nextResetAt}.
      </p>
      <BidForm defaultAmount={defaultAmount} />
      {opening ? (
        <section className="opening" data-opening-song="true">
          <h2>Opening song</h2>
          <p>
            {opening.track} — {opening.artist}
          </p>
          <a
            className="listen"
            href={opening.listenUrl}
            data-listen-url={opening.listenUrl}
          >
            Listen
          </a>
        </section>
      ) : (
        <p className="empty" data-empty-week="true" data-opening-song="false">
          No opening song this week. Nobody has paid yet. We do not invent a
          track or a stream.
        </p>
      )}
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
