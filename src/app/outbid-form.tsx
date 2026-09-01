"use client";

import React, { useState } from "react";
import { MIN_BID_USD } from "../core/money";

type BidFormProps = {
  defaultAmount: number;
  topBidUsd?: number;
  unpaidOff?: boolean;
};

function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return MIN_BID_USD;
  return Math.max(MIN_BID_USD, Math.trunc(value));
}

function formatHeadingUsd(amount: number): string {
  return String(clampAmount(amount));
}

/**
 * The claim rail owns the three durable listing facts. Category/genre is
 * intentionally absent: the current API and Listing schema do not persist it,
 * so a presentation-only program lane must never block checkout.
 */
export function BidForm({
  defaultAmount,
  topBidUsd,
  unpaidOff = false,
}: BidFormProps) {
  const [amount, setAmount] = useState(() => clampAmount(defaultAmount));
  const occupied = topBidUsd !== undefined && topBidUsd >= MIN_BID_USD;
  const takeUsd = clampAmount(defaultAmount);

  function bump(delta: number) {
    setAmount((current) => clampAmount(current + delta));
  }

  return (
    <section
      className={occupied ? "claim" : "claim empty-claim-first"}
      id="claim"
      data-slot="claim-hero"
      data-empty-claim-first={occupied ? undefined : ""}
      aria-label={occupied ? undefined : "Claim #1"}
    >
      <h2 className="claim-heading" data-slot="claim-heading" data-claim-heading="">
        <span>Claim #1 for</span>
        <span className="amount-stepper">
          <button
            type="button"
            className="step"
            aria-label="Decrease bid by one dollar"
            data-amount-decrease=""
            onClick={() => bump(-1)}
          >
            −
          </button>
          <label className="amount-field">
            <span className="sr-only">Amount in whole US dollars</span>
            <span aria-hidden="true">$</span>
            <input
              name="amountUsd"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formatHeadingUsd(amount)}
              aria-label="Bid amount in whole US dollars"
              data-amount-input=""
              form="claim-form"
              onChange={(event) => {
                const next = Number(event.target.value.replace(/[^\d]/g, ""));
                setAmount(clampAmount(next || MIN_BID_USD));
              }}
            />
          </label>
          <button
            type="button"
            className="step"
            aria-label="Increase bid by one dollar"
            data-amount-increase=""
            onClick={() => bump(1)}
          >
            +
          </button>
        </span>
      </h2>

      <form
        className="outbid-form"
        id="claim-form"
        data-slot="claim-form"
        method="post"
        action="/checkout"
        data-bid-form=""
      >
        <div className="listing-fields" data-listing-fields="">
          <label>
            <span>Track</span>
            <input
              name="track"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              placeholder="Track title"
            />
          </label>
          <label>
            <span>Artist</span>
            <input
              name="artist"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              placeholder="Artist name"
            />
          </label>
          <label className="listen-url-field">
            <span>Listen URL</span>
            <input
              id="identity"
              name="listenUrl"
              type="url"
              required
              placeholder="https://"
              autoComplete="url"
              spellCheck={false}
              data-slot="url-input"
              data-identity-input=""
            />
          </label>
        </div>
        <button
          type="submit"
          className="outbid"
          data-slot="claim-button"
          data-claim-submit=""
          data-first-click={!occupied ? "claim" : undefined}
        >
          Outbid
        </button>
        <p
          className="claim-note"
          data-claim-note={occupied ? "take" : "empty"}
          data-empty-bid-five={occupied ? undefined : ""}
          data-empty-claim-window={occupied ? undefined : ""}
          data-unpaid-off={unpaidOff ? "" : undefined}
        >
          {occupied
            ? `Need $${takeUsd} to take #1. A new listing pays that full amount. Same listen URL pays only the difference.${unpaidOff
              ? " An incomplete or abandoned checkout stays off this desk and never becomes #1."
              : ""}`
            : unpaidOff
              ? `$${MIN_BID_USD} claims last 7 days' opening song. A completed payment takes #1. An incomplete or abandoned checkout stays off this desk.`
              : `$${MIN_BID_USD} claims last 7 days' opening song. A completed payment takes #1.`}
        </p>
      </form>
    </section>
  );
}
