import { MIN_BID_USD, type Listing } from "./rank";
import { canonicalizeListenUrl, UrlError } from "./url";

export type CheckoutKind = "create" | "raise";

export class ListingError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ListingError";
  }
}

export type BidQuote = {
  kind: CheckoutKind;
  targetBidUsd: number;
  chargeUsd: number;
};

/** Identity key: stripped listen URL still live in the rolling last 7 days. Same key raises. */
export function canonicalListenUrl(raw: string): string {
  try {
    return canonicalizeListenUrl(raw);
  } catch (error) {
    if (error instanceof UrlError) {
      throw new ListingError(error.code, error.httpStatus);
    }
    throw error;
  }
}

/**
 * Raise identity: canonical listen URL still inside last 7 days.
 * weekId is not the raise key.
 */
export function listingListenKey(listenUrl: string): string {
  return canonicalListenUrl(listenUrl);
}

/** Whole US dollars. Floor and raise-vs-create live in quoteBid. */
export function parseTargetBidUsd(raw: unknown): number {
  if (typeof raw === "boolean") {
    throw new ListingError("bid_not_whole", 400);
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
      throw new ListingError("bid_not_whole", 400);
    }
    return raw;
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ListingError("bid_not_whole", 400);
  }
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!/^\d+$/.test(trimmed)) {
    throw new ListingError("bid_not_whole", 400);
  }
  const value = Number(trimmed);
  if (value < 1) {
    throw new ListingError("bid_not_whole", 400);
  }
  return value;
}

/**
 * First listing in the rolling last 7 days pays the full bid (≥ $5).
 * Same listen URL still inside last 7 days raises. weekId is not the raise key.
 * Charge is only new − current. Raise must be ≥ current + $1.
 */
export function quoteBid(
  existing: Pick<Listing, "bidUsd"> | undefined,
  targetBidUsd: number,
): BidQuote {
  if (!Number.isInteger(targetBidUsd) || targetBidUsd < 1) {
    throw new ListingError("bid_not_whole", 400);
  }
  if (!existing) {
    if (targetBidUsd < MIN_BID_USD) {
      throw new ListingError("bid_below_min", 400);
    }
    return { kind: "create", targetBidUsd, chargeUsd: targetBidUsd };
  }
  if (targetBidUsd <= existing.bidUsd) {
    throw new ListingError("bid_not_higher", 400);
  }
  return {
    kind: "raise",
    targetBidUsd,
    chargeUsd: targetBidUsd - existing.bidUsd,
  };
}

export function targetBidAfterPayment(
  existing: Pick<Listing, "bidUsd"> | undefined,
  chargedUsd: number,
  kind: CheckoutKind,
): number {
  if (kind === "raise") {
    if (!existing) {
      throw new ListingError("bid_not_higher", 400);
    }
    return existing.bidUsd + chargedUsd;
  }
  return chargedUsd;
}
