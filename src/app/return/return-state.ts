import { listingForSession } from "../../core/store";

export type ReturnQuery = {
  sessionId?: string | string[];
  checkoutId?: string | string[];
  intent?: string | string[];
  status?: string | string[];
};

export type ReturnState = {
  status: "paid" | "pending";
  listingId?: string;
};

function firstQuery(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Read-only browser return lookup. Only the verified payment ledger can say paid. */
export function resolveReturn(params: ReturnQuery): ReturnState {
  const intentId = firstQuery(params.intent) ?? firstQuery(params.sessionId) ?? firstQuery(params.checkoutId);
  if (!intentId) return { status: "pending" };
  const listing = listingForSession(intentId);
  return listing ? { status: "paid", listingId: listing.id } : { status: "pending" };
}
