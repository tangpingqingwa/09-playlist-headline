import React from "react";
import { getBoardListings, rankListings } from "../../core/rank";
import { resolveReturn, type ReturnQuery } from "./return-state";


export const dynamic = "force-dynamic";

type ReturnPageProps = { searchParams?: Promise<ReturnQuery> };

async function ReturnPage({ searchParams }: ReturnPageProps) {
  const params = (await searchParams) ?? {};
  const result = resolveReturn(params);
  const listings = rankListings(getBoardListings());
  const listing = listings.find((row) => row.id === result.listingId);

  if (result.status === "pending") {
    return (
      <main className="return-page" data-return="pending">
        <h1>Payment pending</h1>
        <p>
          Payment has not been confirmed. No rank changes until confirmation,
          and an incomplete or abandoned track stays off the station desk.
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

export default ReturnPage;
