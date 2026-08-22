/** ORDER BY bid_usd DESC, first_paid_at ASC, id ASC. Rank is the bid. */

import { listPaidForWeek } from "./store";

export const MIN_BID_USD = 5;

export type Listing = {
  id: string;
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  bidUsd: number;
  firstPaidAt: string;
  lastPaidAt: string;
  clicks: number;
};

export type RankedListing = Listing & { rank: number };

/** Paid listings for the current week only. Unpaid checkout never appears. */
export function getBoardListings(weekId: string): Listing[] {
  return listPaidForWeek(weekId);
}

export function listingsForWeek(
  listings: readonly Listing[],
  weekId: string,
): Listing[] {
  return listings.filter((listing) => listing.weekId === weekId);
}

export function rankListings(listings: readonly Listing[]): RankedListing[] {
  const ordered = [...listings].sort((a, b) => {
    if (a.bidUsd !== b.bidUsd) {
      return b.bidUsd - a.bidUsd;
    }
    if (a.firstPaidAt !== b.firstPaidAt) {
      return a.firstPaidAt < b.firstPaidAt ? -1 : 1;
    }
    if (a.id !== b.id) {
      return a.id < b.id ? -1 : 1;
    }
    return 0;
  });
  return ordered.map((listing, index) => ({ ...listing, rank: index + 1 }));
}
