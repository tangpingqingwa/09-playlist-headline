"use client";

import React, { useState, type FormEvent } from "react";
import { MIN_BID_USD } from "../core/rank";

type BidFormProps = {
  defaultAmount: number;
};

function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return MIN_BID_USD;
  return Math.max(MIN_BID_USD, Math.trunc(value));
}

export function BidForm({ defaultAmount }: BidFormProps) {
  const [amount, setAmount] = useState(() => clampAmount(defaultAmount));

  function bump(delta: number) {
    setAmount((current) => clampAmount(current + delta));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Unpaid: checkout is not live. Submitting must not invent a listing.
    event.preventDefault();
  }

  return (
    <section className="claim" id="claim">
      <form
        className="outbid-form"
        method="post"
        action="/checkout"
        onSubmit={onSubmit}
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
        <p className="claim-note">
          New spots start at ${MIN_BID_USD}. Paying less than #1 still lists at
          the rank that bid can take.
        </p>
        <div className="fields">
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
          <button type="submit" className="outbid">
            Outbid
          </button>
        </div>
        <p className="raise-hint">
          Already on this week? Enter the same listen URL and raise. You pay
          only the difference.
        </p>
        <p className="stub-note" data-checkout-stub="">
          Checkout is not live. No charge and no rank claimed.
        </p>
      </form>
    </section>
  );
}
