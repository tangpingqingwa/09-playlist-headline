import React from "react";
import { getPaymentPort } from "../../billing/port";
import { getBoardListings, rankListings } from "../../core/rank";
import { applyPaidEvent, listingForSession } from "../../core/store";
import { currentWeekUtc } from "../../core/week";

export const dynamic = "force-dynamic";

type ReturnPageProps = {
  searchParams?: Promise<{
    sessionId?: string | string[];
    checkoutId?: string | string[];
    status?: string | string[];
  }>;
};

function firstQuery(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function resolveReturn(params: {
  sessionId?: string | string[];
  checkoutId?: string | string[];
  status?: string | string[];
}): Promise<{ status: "paid" | "pending"; listingId?: string }> {
  const sessionId = firstQuery(params.sessionId) ?? firstQuery(params.checkoutId);
  const rawStatus = firstQuery(params.status);
  const canceled = rawStatus === "cancel" || rawStatus === "canceled" || rawStatus === "abandoned";
  const port = getPaymentPort();

  if (!sessionId) {
    return { status: "pending" };
  }

  if (canceled) {
    await port.abandonCheckout(sessionId);
    return { status: "pending" };
  }

  const already = listingForSession(sessionId);
  if (already) {
    return { status: "paid", listingId: already.id };
  }

  try {
    const paid = await port.completeCheckout(sessionId);
    const listing = applyPaidEvent({
      sessionId: paid.sessionId,
      weekId: paid.listingDraft.weekId,
      track: paid.listingDraft.track,
      artist: paid.listingDraft.artist,
      listenUrl: paid.listingDraft.listenUrl,
      amountUsd: paid.amountUsd,
      paidAt: paid.paidAt,
      kind: paid.kind,
    });
    return { status: "paid", listingId: listing.id };
  } catch {
    return { status: "pending" };
  }
}

export default async function ReturnPage({ searchParams }: ReturnPageProps) {
  const params = (await searchParams) ?? {};
  const result = await resolveReturn(params);
  const week = currentWeekUtc();
  const listings = rankListings(getBoardListings(week.weekId));
  const listing = listings.find((row) => row.id === result.listingId);

  if (result.status === "pending") {
    return (
      <main className="return-page" data-return="pending">
        <h1>Payment pending</h1>
        <p>
          Checkout abandoned or not yet paid. Rank updates only after a completed
          payment. We do not invent an opening track.
        </p>
        <p>
          <a href="/">Back to the board</a>
        </p>
      </main>
    );
  }

  return (
    <main className="return-page" data-return="paid">
      <h1>You&apos;re on the board</h1>
      <p>
        {listing
          ? `${listing.track} is listed at $${listing.bidUsd}.`
          : "Payment completed. Rank updates only after paid."}
      </p>
      <p>
        <a href="/">Back to the board</a>
      </p>
    </main>
  );
}
