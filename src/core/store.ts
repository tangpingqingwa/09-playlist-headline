import { randomUUID } from "node:crypto";
import {
  canonicalListenUrl,
  quoteBid,
  targetBidAfterPayment,
  type CheckoutKind,
} from "./listing";
import { MIN_BID_USD, type Listing } from "./rank";

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

/** Public listen-URL hops. Never a platform play count. */
export function incrementListingClicks(id: string): Listing | undefined {
  const listing = getListingById(id);
  if (!listing) return undefined;
  listing.clicks += 1;
  return listing;
}

/** Same canonical listen URL in this UTC week is one listing. */
export function findPaidByListenUrl(
  weekId: string,
  listenUrl: string,
): Listing | undefined {
  const key = canonicalListenUrl(listenUrl);
  return listings.find(
    (listing) =>
      listing.weekId === weekId && canonicalListenUrl(listing.listenUrl) === key,
  );
}

export type PaidBid = {
  sessionId: string;
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  amountUsd: number;
  paidAt: string;
  kind?: CheckoutKind;
};

export function listingForSession(sessionId: string): Listing | undefined {
  const id = listingIdBySession.get(sessionId);
  return id ? getListingById(id) : undefined;
}

/** Rank updates only after a completed paid event. Session replay is a no-op. */
export function applyPaidEvent(event: PaidBid): Listing {
  if (!Number.isInteger(event.amountUsd) || event.amountUsd < 1) {
    throw new Error("bid must be a whole dollar");
  }
  const existingId = listingIdBySession.get(event.sessionId);
  if (existingId) {
    const existing = getListingById(existingId);
    if (!existing) {
      throw new Error(`checkout ${event.sessionId} points at a missing listing`);
    }
    return existing;
  }

  const existing = findPaidByListenUrl(event.weekId, event.listenUrl);
  const kind: CheckoutKind = event.kind ?? (existing ? "raise" : "create");
  if (kind === "create" && event.amountUsd < MIN_BID_USD) {
    throw new Error(`bid must be a whole dollar >= ${MIN_BID_USD}`);
  }

  if (existing) {
    if (kind === "create") {
      throw new Error("same listen URL this week must raise, not create");
    }
    const targetBidUsd = targetBidAfterPayment(existing, event.amountUsd, kind);
    quoteBid(existing, targetBidUsd);
    existing.track = event.track;
    existing.artist = event.artist;
    existing.listenUrl = canonicalListenUrl(event.listenUrl);
    existing.bidUsd = targetBidUsd;
    existing.lastPaidAt = event.paidAt;
    listingIdBySession.set(event.sessionId, existing.id);
    return existing;
  }

  if (kind === "raise") {
    throw new Error("raise requires an existing listing this week");
  }

  const listing: Listing = {
    id: `lst_${randomUUID()}`,
    weekId: event.weekId,
    track: event.track,
    artist: event.artist,
    listenUrl: canonicalListenUrl(event.listenUrl),
    bidUsd: event.amountUsd,
    firstPaidAt: event.paidAt,
    lastPaidAt: event.paidAt,
    clicks: 0,
  };
  listings.push(listing);
  listingIdBySession.set(event.sessionId, listing.id);
  return listing;
}
