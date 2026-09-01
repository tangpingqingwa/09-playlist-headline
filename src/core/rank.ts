/** ORDER BY bid_usd DESC, first_paid_at ASC, id ASC. Rank is the bid. */

import { listPaidInRollingWeek } from "./store";
import { bidInRollingWeek, nowUtc } from "./week";
import { MIN_BID_USD } from "./money";

export { MIN_BID_USD };

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

/**
 * A verified provider has reported a completed payment. Unpaid / abandoned checkout
 * is not a listing and must not paint #1 opening-song chrome.
 */
export function isPaidListing(
  listing: Pick<Listing, "firstPaidAt">,
): boolean {
  const paidAt = listing.firstPaidAt;
  if (typeof paidAt !== "string" || paidAt.trim() === "") return false;
  const ms = Date.parse(paidAt);
  return Number.isFinite(ms);
}

/**
 * Live board is provider-paid rows whose firstPaidAt is in the rolling last 7 days.
 * `weekId` is an audit label. Never invent a #1 track.
 * Same listen URL still inside last 7 days raises. A new URL always pays a full bid.
 * weekId is not the raise key.
 */
export function getBoardListings(now: Date = nowUtc()): Listing[] {
  return listPaidInRollingWeek(now).filter(isPaidListing);
}

/** Live board rows: paid firstPaidAt in the rolling last 7 days. Not weekId. */
export function listingsForWeek(
  listings: readonly Listing[],
  now: Date = nowUtc(),
): Listing[] {
  return listings.filter(
    (listing) =>
      isPaidListing(listing) && bidInRollingWeek(listing.firstPaidAt, now),
  );
}

/**
 * Display order among paid rows only: bidUsd DESC, firstPaidAt ASC
 * (older wins ties), id ASC. Unpaid drafts never rank.
 */
export function rankListings(listings: readonly Listing[]): RankedListing[] {
  const ordered = listings.filter(isPaidListing).slice().sort((a, b) => {
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
