import { randomUUID } from "node:crypto";
import type { Listing } from "./rank";

const MIN_BID_USD = 5;

const listings: Listing[] = [];
const listingIdBySession = new Map<string, string>();

/** Drop in-memory paid rows. Tests only. */
export function resetListings(): void {
  listings.length = 0;
  listingIdBySession.clear();
}

export function listPaidForWeek(weekId: string): Listing[] {
  return listings.filter((listing) => listing.weekId === weekId);
}

export function getListingById(id: string): Listing | undefined {
  return listings.find((listing) => listing.id === id);
}

export type PaidBid = {
  sessionId: string;
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  amountUsd: number;
  paidAt: string;
};

export function listingForSession(sessionId: string): Listing | undefined {
  const id = listingIdBySession.get(sessionId);
  return id ? getListingById(id) : undefined;
}

/** Rank updates only after a completed paid event. Session replay is a no-op. */
export function applyPaidEvent(event: PaidBid): Listing {
  if (!Number.isInteger(event.amountUsd) || event.amountUsd < MIN_BID_USD) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }
  const existingId = listingIdBySession.get(event.sessionId);
  if (existingId) {
    const existing = getListingById(existingId);
    if (!existing) {
      throw new Error(`checkout ${event.sessionId} points at a missing listing`);
    }
    return existing;
  }
  const listing: Listing = {
    id: `lst_${randomUUID()}`,
    weekId: event.weekId,
    track: event.track,
    artist: event.artist,
    listenUrl: event.listenUrl,
    bidUsd: event.amountUsd,
    firstPaidAt: event.paidAt,
    lastPaidAt: event.paidAt,
    clicks: 0,
  };
  listings.push(listing);
  listingIdBySession.set(event.sessionId, listing.id);
  return listing;
}
