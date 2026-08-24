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

/**
 * Polar has reported a completed payment. Unpaid / abandoned checkout
 * is not a listing and must not paint #1 opening-song chrome.
 */
export function isPolarPaidListing(
  listing: Pick<Listing, "firstPaidAt">,
): boolean {
  const paidAt = listing.firstPaidAt;
  if (typeof paidAt !== "string" || paidAt.trim() === "") return false;
  const ms = Date.parse(paidAt);
  return Number.isFinite(ms);
}

/** Live board has no paid rows until Polar reports paid. Never invent a #1 track. */
export function getBoardListings(weekId: string): Listing[] {
  return listPaidForWeek(weekId).filter(isPolarPaidListing);
}

export function listingsForWeek(
  listings: readonly Listing[],
  weekId: string,
): Listing[] {
  return listings.filter((listing) => listing.weekId === weekId);
}

/**
 * Display order among Polar-paid rows only: bidUsd DESC, firstPaidAt ASC
 * (older wins ties), id ASC. Unpaid drafts never rank.
 */
export function rankListings(listings: readonly Listing[]): RankedListing[] {
  const ordered = listings.filter(isPolarPaidListing).slice().sort((a, b) => {
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
