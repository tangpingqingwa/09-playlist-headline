"use client";

import React, { useState } from "react";
import { MIN_BID_USD } from "../core/rank";

type BidFormProps = {
  defaultAmount: number;
  topBidUsd?: number;
  unpaidOff?: boolean;
};

function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return MIN_BID_USD;
  return Math.max(MIN_BID_USD, Math.trunc(value));
}

function ListingIdentityFields() {
  return (
    <>
      <label>
        Track
        <input
          name="track"
          type="text"
          required
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Artist
        <input
          name="artist"
          type="text"
          required
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="url">
        Listen URL
        <input
          name="listenUrl"
          type="url"
          required
          placeholder="https://"
          autoComplete="url"
          spellCheck={false}
        />
      </label>
    </>
  );
}

function OccupiedListingWrite() {
  return (
    <div className="fields">
      <ListingIdentityFields />
      <button type="submit" className="outbid">
        Outbid
      </button>
    </div>
  );
}

function EmptyClaimFirstWrite() {
  return (
    <>
      <button type="submit" className="outbid" data-first-click="claim">
        Outbid
      </button>
      <div
        className="fields listen-identity"
        data-listen-identity=""
        data-later-write=""
      >
        <p className="later-write-label">Then the listen URL</p>
        <ListingIdentityFields />
      </div>
    </>
  );
}

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
      data-empty-claim-first={occupied ? undefined : ""}
      aria-label={occupied ? undefined : "Claim #1"}
    >
      <form
        className="outbid-form"
        method="post"
        action="/checkout"
        data-bid-form=""
      >
        <h2>
          <span>Claim #1 for</span>
          <span className="amount-stepper">
            <button
              type="button"
              className="step"
              aria-label="Decrease bid by one dollar"
              onClick={() => bump(-1)}
            >
              −
            </button>
            <label className="amount-field">
              <span className="sr-only">Amount in whole US dollars</span>
              $
              <input
                name="amountUsd"
                inputMode="numeric"
                pattern="[0-9]*"
                value={amount}
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
              onClick={() => bump(1)}
            >
              +
            </button>
          </span>
        </h2>
        <p
          className="claim-note"
          data-claim-note={occupied ? "take" : "empty"}
          data-empty-bid-five={occupied ? undefined : ""}
          data-empty-claim-window={occupied ? undefined : ""}
          data-unpaid-off={unpaidOff ? "" : undefined}
        >
          {occupied
            ? `Need $${takeUsd} to take #1. A new listing pays that full amount. Same listen URL pays only the difference. Unpaid Polar checkout stays off this desk until Polar reports paid. An abandoned track is not #1.`
            : unpaidOff
              ? `$${MIN_BID_USD} claims last 7 days' opening song. A completed payment takes #1. Unpaid Polar checkout stays off this desk until Polar reports paid. An abandoned track is not #1.`
              : `$${MIN_BID_USD} claims last 7 days' opening song. A completed payment takes #1.`}
        </p>
        {occupied ? <OccupiedListingWrite /> : <EmptyClaimFirstWrite />}
      </form>
    </section>
  );
}
