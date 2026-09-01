import type { RankedListing } from "../core/rank";

/**
 * Presentation-only facts for the station desk. Durable listings stay limited
 * to track, artist, listen URL, bid, timestamps, and clicks.
 */
export type HomepageListingPresentation = {
  key: string;
  host: string;
  age: string;
};

export type PresentedListing = RankedListing & HomepageListingPresentation;

export type RankingPeriod = "all-time" | "today";

const ROLLING_TODAY_MS = 86_400_000;

function hostOf(listenUrl: string): string {
  try {
    return new URL(listenUrl).hostname.replace(/^www\./, "");
  } catch {
    return "listen source";
  }
}

function ageFrom(firstPaidAt: string, nowIso: string): string {
  const first = Date.parse(firstPaidAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(first) || !Number.isFinite(now) || first > now) {
    return "recently";
  }
  const days = Math.floor((now - first) / ROLLING_TODAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function keyFor(listing: RankedListing): string {
  return `${listing.track.trim().toLowerCase()}::${listing.artist.trim().toLowerCase()}`
    .replace(/[^a-z0-9:]+/g, "-");
}

/** Filter already-ranked paid rows without changing the durable ranking model. */
export function filterListingsForPeriod(
  listings: readonly RankedListing[],
  period: RankingPeriod,
  nowIso: string,
): RankedListing[] {
  if (period === "all-time") return listings.slice();
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return [];
  return listings
    .filter((listing) => {
      const paidAt = Date.parse(listing.firstPaidAt);
      return Number.isFinite(paidAt) && paidAt >= now - ROLLING_TODAY_MS && paidAt <= now;
    })
    .map((listing, index) => ({ ...listing, rank: index + 1 }));
}

/** Derive only visible facts from a listing; no genre, stream, or social proof is invented. */
export function presentListing(
  listing: RankedListing,
  nowIso = new Date().toISOString(),
): PresentedListing {
  return {
    ...listing,
    key: keyFor(listing),
    host: hostOf(listing.listenUrl),
    age: ageFrom(listing.firstPaidAt, nowIso),
  };
}

export function presentListings(
  listings: readonly RankedListing[],
  nowIso = new Date().toISOString(),
): PresentedListing[] {
  return listings.map((listing) => presentListing(listing, nowIso));
}
