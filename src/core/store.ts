import { randomUUID } from "node:crypto";
import {
  canonicalListenUrl,
  quoteBid,
  targetBidAfterPayment,
  type CheckoutKind,
} from "./listing";
import { MIN_BID_USD, type Listing } from "./rank";
import { bidInRollingWeek, nowUtc } from "./week";

/** Open Polar checkout. Never a ranked track until Polar reports paid. */
export type UnpaidTrack = {
  sessionId: string;
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  bidUsd: number;
};

const listings: Listing[] = [];
const unpaidTracks: UnpaidTrack[] = [];
const listingIdBySession = new Map<string, string>();

function hasPaidInstant(listing: Pick<Listing, "firstPaidAt">): boolean {
  const paidAt = listing.firstPaidAt;
  if (typeof paidAt !== "string" || paidAt.trim() === "") return false;
  return Number.isFinite(Date.parse(paidAt));
}

/** Drop in-memory paid rows and unpaid Polar leftovers. Tests only. */
export function resetListings(): void {
  listings.length = 0;
  unpaidTracks.length = 0;
  listingIdBySession.clear();
}

/** Polar-paid rows still inside the rolling last-7-days window. */
export function listPaidInRollingWeek(now: Date = nowUtc()): Listing[] {
  return listings.filter(
    (listing) =>
      hasPaidInstant(listing) && bidInRollingWeek(listing.firstPaidAt, now),
  );
}

/** Polar-paid rows stored under an ISO weekId label. Archive / audit only. */
export function listPaidForWeek(weekId: string): Listing[] {
  return listings.filter(
    (listing) => listing.weekId === weekId && hasPaidInstant(listing),
  );
}

/** Abandoned / open Polar checkout. Stays off the station desk. */
export function listUnpaid(weekId: string): UnpaidTrack[] {
  return unpaidTracks
    .filter((row) => row.weekId === weekId)
    .map((row) => ({ ...row }));
}

export function rememberUnpaidCheckout(input: UnpaidTrack): void {
  if (listingIdBySession.has(input.sessionId)) return;
  const existing = unpaidTracks.findIndex(
    (row) => row.sessionId === input.sessionId,
  );
  const track: UnpaidTrack = {
    sessionId: input.sessionId,
    weekId: input.weekId,
    track: input.track,
    artist: input.artist,
    listenUrl: canonicalListenUrl(input.listenUrl),
    bidUsd: input.bidUsd,
  };
  if (existing >= 0) {
    unpaidTracks[existing] = track;
    return;
  }
  unpaidTracks.push(track);
}

export function forgetUnpaidCheckout(sessionId: string): void {
  const index = unpaidTracks.findIndex((row) => row.sessionId === sessionId);
  if (index >= 0) unpaidTracks.splice(index, 1);
}

export function getListingById(id: string): Listing | undefined {
  return listings.find(
    (listing) => listing.id === id && hasPaidInstant(listing),
  );
}

/** Public listen-URL hops. Never a platform play count. */
export function incrementListingClicks(id: string): Listing | undefined {
  const listing = getListingById(id);
  if (!listing) return undefined;
  listing.clicks += 1;
  return listing;
}

/** Same canonical listen URL still live in the rolling last 7 days is a raise. */
export function findPaidByListenUrl(
  listenUrl: string,
  now: Date = nowUtc(),
): Listing | undefined {
  const key = canonicalListenUrl(listenUrl);
  return listPaidInRollingWeek(now).find(
    (listing) => canonicalListenUrl(listing.listenUrl) === key,
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
  forgetUnpaidCheckout(event.sessionId);
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

  const existing = findPaidByListenUrl(event.listenUrl);
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
