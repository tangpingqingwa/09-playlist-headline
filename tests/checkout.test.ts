import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { POST as postCheckout } from "../src/app/api/checkout/route";
import { POST as postWebhook } from "../src/app/api/polar/webhook/route";
import ReturnPage, { resolveReturn } from "../src/app/return/page";
import { FixturePayment } from "../src/billing/fixture";
import { PolarPayment, POLAR_API_BASE, polarApiBase } from "../src/billing/polar";
import {
  CheckoutError,
  createPaymentPort,
  getPaymentPort,
  parseAmountUsd,
  resetPaymentPort,
} from "../src/billing/port";
import { polarLiveEnabled } from "../src/config";
import {
  ListingError,
  listingListenKey,
  parseTargetBidUsd,
  quoteBid,
} from "../src/core/listing";
import { createElement } from "react";
import { Board } from "../src/app/page";
import { getBoardListings, MIN_BID_USD, rankListings } from "../src/core/rank";
import {
  applyPaidEvent,
  findPaidByListenUrl,
  listPaidForWeek,
  listUnpaid,
  resetListings,
} from "../src/core/store";
import { currentWeekUtc, isoWeekId, nowUtc } from "../src/core/week";

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

afterEach(() => {
  resetListings();
  resetPaymentPort();
});

function weekId(): string {
  return currentWeekUtc().weekId;
}

function draft(overrides: Partial<{
  track: string;
  artist: string;
  listenUrl: string;
  weekId: string;
}> = {}) {
  return {
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    weekId: weekId(),
    ...overrides,
  };
}

async function postForm(fields: Record<string, string>, path = "/checkout"): Promise<Response> {
  const body = new URLSearchParams(fields);
  return postCheckout(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
}

async function postJson(payload: Record<string, unknown>): Promise<Response> {
  return postCheckout(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

test("createPaymentPort stays fixture unless POLAR_LIVE=1", () => {
  assert.equal(polarLiveEnabled({}), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "0" }), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "true" }), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1" }), false);
  assert.equal(createPaymentPort({}).kind, "fixture");
  assert.equal(createPaymentPort({ POLAR_LIVE: "0" }).kind, "fixture");
  assert.equal(createPaymentPort({ POLAR_LIVE: "true" }).kind, "fixture");
  assert.throws(
    () => createPaymentPort({ POLAR_LIVE: "1" }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
  const live = createPaymentPort({
    POLAR_LIVE: "1",
    POLAR_ACCESS_TOKEN: "polar_tok_test",
  });
  assert.equal(live.kind, "live");
});

test("POLAR_FIXTURE_ONLY=1 wins over POLAR_LIVE=1", () => {
  const previousLive = process.env.POLAR_LIVE;
  const previousFixture = process.env.POLAR_FIXTURE_ONLY;
  process.env.POLAR_LIVE = "1";
  process.env.POLAR_FIXTURE_ONLY = "1";
  try {
    resetPaymentPort();
    assert.equal(polarLiveEnabled(), false);
    assert.equal(getPaymentPort().kind, "fixture");
    assert.throws(() => new PolarPayment({ env: process.env }), /POLAR_LIVE=1/);
  } finally {
    if (previousLive === undefined) delete process.env.POLAR_LIVE;
    else process.env.POLAR_LIVE = previousLive;
    if (previousFixture === undefined) delete process.env.POLAR_FIXTURE_ONLY;
    else process.env.POLAR_FIXTURE_ONLY = previousFixture;
    resetPaymentPort();
  }
});

test("$5 fixture create lists at #1", async () => {
  const port = getPaymentPort();
  assert.equal(port.kind, "fixture");
  const started = await port.createCheckout({
    listingDraft: draft(),
    amountUsd: MIN_BID_USD,
    kind: "create",
  });
  assert.equal(getBoardListings().length, 0);

  const paid = await port.completeCheckout(started.sessionId);
  const listing = applyPaidEvent({
    sessionId: paid.sessionId,
    weekId: paid.listingDraft.weekId,
    track: paid.listingDraft.track,
    artist: paid.listingDraft.artist,
    listenUrl: paid.listingDraft.listenUrl,
    amountUsd: paid.amountUsd,
    paidAt: paid.paidAt,
  });
  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.id, listing.id);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.bidUsd, 5);
  assert.equal(ranked[0]?.clicks, 0);
  assert.equal(ranked[0]?.track, "Cold Open");
});

test("abandoned checkout does not list", async () => {
  const port = new FixturePayment();
  const started = await port.createCheckout({
    listingDraft: draft({
      track: "Ghost Track",
      listenUrl: "https://example.com/ghost",
    }),
    amountUsd: 12,
    kind: "create",
  });
  await port.abandonCheckout(started.sessionId);
  await assert.rejects(port.completeCheckout(started.sessionId), /payment_incomplete/);
  assert.equal(getBoardListings().length, 0);

  const result = await resolveReturn({
    sessionId: started.sessionId,
    status: "cancel",
  });
  assert.equal(result.status, "pending");
  assert.equal(getBoardListings().length, 0);
});

test("unpaid Polar checkout stays off the station desk until Polar reports paid", async () => {
  const started = await postForm({
    track: "Ghost Track",
    artist: "Vapor",
    listenUrl: "https://example.com/ghost",
    amountUsd: "99",
  });
  assert.equal(started.status, 303);
  assert.equal(getBoardListings().length, 0);
  const leftover = listUnpaid(weekId());
  assert.equal(leftover.length, 1);
  assert.equal(leftover[0]?.track, "Ghost Track");
  assert.equal(leftover[0]?.artist, "Vapor");

  const html = renderToStaticMarkup(
    createElement(Board, {
      weekId: weekId(),
      nextResetAt: currentWeekUtc().nextResetAt.toISOString(),
      listings: rankListings(getBoardListings()),
      unpaid: leftover,
    }),
  );
  assert.match(html, /No opening song/);
  assert.match(html, /data-unpaid-off=""/);
  assert.match(html, /until Polar reports paid/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /Bid USD/);
  assert.doesNotMatch(html, /Ghost Track/);
  assert.doesNotMatch(html, /Vapor/);
  assert.doesNotMatch(html, /\$99/);
  assert.doesNotMatch(html, /data-prize=/);
  assert.doesNotMatch(html, /Hear this week/);

  const sessionId = new URL(started.headers.get("location") ?? "", "http://localhost")
    .searchParams.get("sessionId");
  assert.ok(sessionId);
  const expired = await postWebhook(
    new Request("http://localhost/api/polar/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "checkout.updated",
        data: { id: sessionId, status: "expired" },
      }),
    }),
  );
  assert.equal(expired.status, 200);
  assert.deepEqual(await expired.json(), { received: true, applied: false });
  assert.equal(getBoardListings().length, 0);
  assert.equal(listUnpaid(weekId()).length, 0);
});

test("underbid still lists below #1", async () => {
  const port = getPaymentPort();
  const first = await port.createCheckout({
    listingDraft: draft({
      track: "Twelve Dollar",
      listenUrl: "https://example.com/twelve",
    }),
    amountUsd: 12,
    kind: "create",
  });
  const firstPaid = await port.completeCheckout(first.sessionId);
  applyPaidEvent({
    sessionId: firstPaid.sessionId,
    weekId: firstPaid.listingDraft.weekId,
    track: firstPaid.listingDraft.track,
    artist: firstPaid.listingDraft.artist,
    listenUrl: firstPaid.listingDraft.listenUrl,
    amountUsd: firstPaid.amountUsd,
    paidAt: firstPaid.paidAt,
  });

  const second = await port.createCheckout({
    listingDraft: draft({
      track: "Five Dollar",
      listenUrl: "https://example.com/five",
    }),
    amountUsd: 5,
    kind: "create",
  });
  const secondPaid = await port.completeCheckout(second.sessionId);
  applyPaidEvent({
    sessionId: secondPaid.sessionId,
    weekId: secondPaid.listingDraft.weekId,
    track: secondPaid.listingDraft.track,
    artist: secondPaid.listingDraft.artist,
    listenUrl: secondPaid.listingDraft.listenUrl,
    amountUsd: secondPaid.amountUsd,
    paidAt: secondPaid.paidAt,
  });

  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]?.track, "Twelve Dollar");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.track, "Five Dollar");
  assert.equal(ranked[1]?.rank, 2);
  assert.equal(ranked[1]?.bidUsd, 5);
});

test("POST /checkout $5 then return lists at #1", async () => {
  const started = await postForm({
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    amountUsd: "5",
  });
  assert.equal(started.status, 303);
  const location = started.headers.get("location") ?? "";
  assert.match(location, /\/return\?sessionId=/);
  assert.equal(getBoardListings().length, 0);

  const sessionId = new URL(location).searchParams.get("sessionId");
  assert.ok(sessionId);
  const result = await resolveReturn({ sessionId });
  assert.equal(result.status, "paid");
  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.bidUsd, 5);
  assert.equal(ranked[0]?.clicks, 0);
});

test("bids below $5 and cents are rejected and never charged", async () => {
  const below = await postJson({
    track: "Cheap",
    artist: "Ada",
    listenUrl: "https://example.com/cheap",
    amountUsd: 4,
  });
  assert.equal(below.status, 400);
  assert.deepEqual(await below.json(), { error: "bid_below_min" });

  const cents = await postJson({
    track: "Cents",
    artist: "Ada",
    listenUrl: "https://example.com/cents",
    amountUsd: "5.50",
  });
  assert.equal(cents.status, 400);
  assert.deepEqual(await cents.json(), { error: "bid_not_whole" });
  assert.equal(getBoardListings().length, 0);

  assert.throws(() => parseAmountUsd("4"), (err: unknown) => {
    assert.ok(err instanceof CheckoutError);
    assert.equal(err.code, "bid_below_min");
    return true;
  });
  assert.equal(parseTargetBidUsd("4"), 4);
  assert.throws(() => quoteBid(undefined, 4), (err: unknown) => {
    assert.ok(err instanceof ListingError);
    assert.equal(err.code, "bid_below_min");
    return true;
  });
});

test("http listen URL is rejected", async () => {
  const response = await postJson({
    track: "Insecure",
    artist: "Ada",
    listenUrl: "http://example.com/insecure",
    amountUsd: 5,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "url_insecure" });
  assert.equal(getBoardListings().length, 0);
});

test("fixture webhook paid event lists; expired does not", async () => {
  const paidBody = JSON.stringify({
    type: "checkout.updated",
    data: {
      id: "chk_recorded_paid",
      status: "succeeded",
      amount: 500,
      metadata: {
        track: "Webhook Open",
        artist: "Ada",
        listenUrl: "https://example.com/webhook-open",
        weekId: weekId(),
        amountUsd: "5",
        kind: "create",
      },
    },
  });
  const paid = await postWebhook(
    new Request("http://localhost/api/polar/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: paidBody,
    }),
  );
  assert.equal(paid.status, 200);
  assert.deepEqual(await paid.json(), { received: true, applied: true });
  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.bidUsd, 5);
  assert.equal(ranked[0]?.track, "Webhook Open");

  const again = await postWebhook(
    new Request("http://localhost/api/polar/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: paidBody,
    }),
  );
  assert.equal(again.status, 200);
  assert.equal(getBoardListings().length, 1);

  const expired = await postWebhook(
    new Request("http://localhost/api/polar/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "checkout.updated",
        data: {
          id: "chk_recorded_expired",
          status: "expired",
          amount: 800,
          metadata: {
            track: "Ghost",
            artist: "Ada",
            listenUrl: "https://example.com/ghost",
            weekId: weekId(),
            amountUsd: "8",
          },
        },
      }),
    }),
  );
  assert.equal(expired.status, 200);
  assert.deepEqual(await expired.json(), { received: true, applied: false });
  assert.equal(getBoardListings().length, 1);
});

test("polarApiBase defaults to production and honors POLAR_API_BASE", () => {
  assert.equal(polarApiBase({}), POLAR_API_BASE);
  assert.equal(polarApiBase({ POLAR_API_BASE: "" }), POLAR_API_BASE);
  assert.equal(polarApiBase({ POLAR_API_BASE: POLAR_API_BASE }), POLAR_API_BASE);
  const sandboxApi = `https://${["sandbox-api", "polar", "sh"].join(".")}`;
  assert.equal(polarApiBase({ POLAR_API_BASE: `${sandboxApi}/` }), sandboxApi);
});

test("live PolarCheckout never fetches unless POLAR_LIVE=1", async () => {
  assert.throws(
    () => new PolarPayment({ env: {} }),
    /PolarPayment requires POLAR_LIVE=1/,
  );
  assert.throws(
    () => new PolarPayment({ env: { POLAR_LIVE: "1" } }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );

  let fetches = 0;
  const polar = new PolarPayment({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_tok_test",
      PUBLIC_BASE_URL: "http://localhost:3000",
    },
    fetch: async (input) => {
      fetches += 1;
      assert.equal(String(input), `${polarApiBase()}/v1/checkouts/`);
      assert.equal(String(input), `${POLAR_API_BASE}/v1/checkouts/`);
      return new Response(
        JSON.stringify({
          id: "chk_recorded_open",
          status: "open",
          url: "https://example.test/checkout/chk_recorded_open",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const session = await polar.createCheckout({
    listingDraft: draft(),
    amountUsd: 5,
    kind: "create",
  });
  assert.equal(fetches, 1);
  assert.equal(session.sessionId, "chk_recorded_open");
  assert.equal(session.checkoutUrl, "https://example.test/checkout/chk_recorded_open");
  await assert.rejects(
    polar.completeCheckout(session.sessionId),
    /completes via webhook only/,
  );
  assert.equal(getBoardListings().length, 0);
});

test("live Polar checkout uses POLAR_API_BASE override and optional product_id", async () => {
  const sandboxApi = `https://${["sandbox-api", "polar", "sh"].join(".")}`;
  const sandboxCheckout = `https://${["sandbox", "polar", "sh"].join(".")}/checkout/chk_sandbox_open`;
  let fetches = 0;
  const polar = new PolarPayment({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_tok_test",
      POLAR_API_BASE: `${sandboxApi}/`,
      POLAR_PRODUCT_ID: "prod_sandbox_test",
      PUBLIC_BASE_URL: "http://localhost:3000",
    },
    fetch: async (input, init) => {
      fetches += 1;
      assert.equal(String(input), `${sandboxApi}/v1/checkouts/`);
      assert.notEqual(String(input), `${POLAR_API_BASE}/v1/checkouts/`);
      const raw = typeof init?.body === "string" ? init.body : "";
      const body = JSON.parse(raw) as Record<string, unknown>;
      assert.equal(body.product_id, "prod_sandbox_test");
      assert.equal(body.amount, 500);
      assert.equal(body.currency, "usd");
      return new Response(
        JSON.stringify({
          id: "chk_sandbox_open",
          status: "open",
          url: sandboxCheckout,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const session = await polar.createCheckout({
    listingDraft: draft(),
    amountUsd: 5,
    kind: "create",
  });
  assert.equal(fetches, 1);
  assert.equal(session.sessionId, "chk_sandbox_open");
  assert.equal(session.checkoutUrl, sandboxCheckout);
  assert.equal(getBoardListings().length, 0);
});

test("live Polar webhook signed paid event lists", async () => {
  const secret = "whsec_test";
  const polar = new PolarPayment({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_tok_test",
      POLAR_WEBHOOK_SECRET: secret,
    },
    fetch: async () => {
      throw new Error("live Polar must not fetch from webhook tests");
    },
  });
  const raw = JSON.stringify({
    type: "checkout.updated",
    data: {
      id: "chk_underbid",
      status: "succeeded",
      amount: 800,
      metadata: {
        track: "Underbid",
        artist: "Bea",
        listenUrl: "https://example.com/underbid",
        weekId: weekId(),
        amountUsd: "8",
        kind: "create",
      },
    },
  });
  await assert.rejects(polar.handleWebhook(raw, {}), /signature/);

  const webhookId = "msg_1";
  const timestamp = "1710000000";
  const signature = createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${raw}`)
    .digest("base64");
  const result = await polar.handleWebhook(raw, {
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  });
  assert.ok(!("ignored" in result));
  if ("ignored" in result) return;
  applyPaidEvent({
    sessionId: result.sessionId,
    weekId: result.listingDraft.weekId,
    track: result.listingDraft.track,
    artist: result.listingDraft.artist,
    listenUrl: result.listingDraft.listenUrl,
    amountUsd: result.amountUsd,
    paidAt: result.paidAt,
  });
  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.bidUsd, 8);
  assert.equal(ranked[0]?.track, "Underbid");
});

test("/return markup shows paid or pending and never trusts query alone", async () => {
  const pendingHtml = renderToStaticMarkup(
    await ReturnPage({
      searchParams: Promise.resolve({ status: "paid" }),
    }),
  );
  assert.match(pendingHtml, /data-return="pending"/);
  assert.match(pendingHtml, /not yet paid|abandoned/i);
  assert.doesNotMatch(pendingHtml, /data-return="paid"/);
  assert.equal(getBoardListings().length, 0);

  const started = await getPaymentPort().createCheckout({
    listingDraft: draft(),
    amountUsd: 5,
    kind: "create",
  });
  const paidHtml = renderToStaticMarkup(
    await ReturnPage({
      searchParams: Promise.resolve({ sessionId: started.sessionId }),
    }),
  );
  assert.match(paidHtml, /data-return="paid"/);
  assert.match(paidHtml, /on the board/i);
  assert.equal(rankListings(getBoardListings())[0]?.rank, 1);
});

test("quoteBid charges the full first bid and only the raise difference", () => {
  assert.deepEqual(quoteBid(undefined, 5), {
    kind: "create",
    targetBidUsd: 5,
    chargeUsd: 5,
  });
  assert.deepEqual(quoteBid({ bidUsd: 5 }, 12), {
    kind: "raise",
    targetBidUsd: 12,
    chargeUsd: 7,
  });
  assert.throws(() => quoteBid({ bidUsd: 5 }, 5), (err: unknown) => {
    assert.ok(err instanceof ListingError);
    assert.equal(err.code, "bid_not_higher");
    return true;
  });
  assert.throws(() => quoteBid({ bidUsd: 12 }, 7), (err: unknown) => {
    assert.ok(err instanceof ListingError);
    assert.equal(err.code, "bid_not_higher");
    return true;
  });
});

test("SPEC acceptance 5: #2 raises $5 → $12 pays $7; firstPaidAt unchanged", async () => {
  const port = getPaymentPort();
  const firstPaidAt = "2026-08-17T09:00:00.000Z";
  const incumbent = applyPaidEvent({
    sessionId: "chk_incumbent_12",
    weekId: weekId(),
    track: "Twelve Dollar",
    artist: "Bea",
    listenUrl: "https://example.com/twelve",
    amountUsd: 12,
    paidAt: "2026-08-17T10:00:00.000Z",
    kind: "create",
  });
  const opener = applyPaidEvent({
    sessionId: "chk_opener_5",
    weekId: weekId(),
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    amountUsd: 5,
    paidAt: firstPaidAt,
    kind: "create",
  });
  const before = rankListings(getBoardListings());
  assert.equal(before[0]?.id, incumbent.id);
  assert.equal(before[1]?.id, opener.id);
  assert.equal(before[1]?.bidUsd, 5);

  const raiseJson = await postJson({
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    amountUsd: 12,
  });
  assert.equal(raiseJson.status, 200);
  const raiseBody = (await raiseJson.json()) as {
    checkoutUrl: string;
    sessionId: string;
  };
  const raiseSession = port.getCheckout(raiseBody.sessionId);
  assert.equal(raiseSession?.kind, "raise");
  assert.equal(raiseSession?.amountUsd, 7);
  assert.equal(getBoardListings().length, 2);
  assert.equal(getBoardListings().find((row) => row.id === opener.id)?.bidUsd, 5);

  const paid = await port.completeCheckout(raiseBody.sessionId);
  assert.equal(paid.kind, "raise");
  assert.equal(paid.amountUsd, 7);
  const raised = applyPaidEvent({
    sessionId: paid.sessionId,
    weekId: paid.listingDraft.weekId,
    track: paid.listingDraft.track,
    artist: paid.listingDraft.artist,
    listenUrl: paid.listingDraft.listenUrl,
    amountUsd: paid.amountUsd,
    paidAt: paid.paidAt,
    kind: paid.kind,
  });
  assert.equal(raised.id, opener.id);
  assert.equal(raised.bidUsd, 12);
  assert.equal(raised.firstPaidAt, firstPaidAt);
  assert.notEqual(raised.lastPaidAt, firstPaidAt);

  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]?.id, opener.id);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.bidUsd, 12);
  assert.equal(ranked[0]?.firstPaidAt, firstPaidAt);
  assert.equal(ranked[1]?.id, incumbent.id);
  assert.equal(ranked[1]?.bidUsd, 12);
});

test("different listing pays the full amount and cannot steal a raise difference", async () => {
  applyPaidEvent({
    sessionId: "chk_cover_12",
    weekId: weekId(),
    track: "Cover",
    artist: "Bea",
    listenUrl: "https://example.com/cover",
    amountUsd: 12,
    paidAt: "2026-08-17T09:00:00.000Z",
    kind: "create",
  });

  const steal = await postJson({
    track: "Rival",
    artist: "Cid",
    listenUrl: "https://example.com/rival",
    amountUsd: 7,
  });
  assert.equal(steal.status, 200);
  const stealBody = (await steal.json()) as { sessionId: string };
  const stealSession = getPaymentPort().getCheckout(stealBody.sessionId);
  assert.equal(stealSession?.kind, "create");
  assert.equal(stealSession?.amountUsd, 7);

  const paid = await getPaymentPort().completeCheckout(stealBody.sessionId);
  applyPaidEvent({
    sessionId: paid.sessionId,
    weekId: paid.listingDraft.weekId,
    track: paid.listingDraft.track,
    artist: paid.listingDraft.artist,
    listenUrl: paid.listingDraft.listenUrl,
    amountUsd: paid.amountUsd,
    paidAt: paid.paidAt,
    kind: paid.kind,
  });

  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]?.listenUrl, "https://example.com/cover");
  assert.equal(ranked[0]?.bidUsd, 12);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.listenUrl, "https://example.com/rival");
  assert.equal(ranked[1]?.bidUsd, 7);
  assert.equal(ranked[1]?.rank, 2);
});

test("bid_not_higher when raise is not above the current bid", async () => {
  applyPaidEvent({
    sessionId: "chk_stay_8",
    weekId: weekId(),
    track: "Stay",
    artist: "Ada",
    listenUrl: "https://example.com/stay",
    amountUsd: 8,
    paidAt: "2026-08-17T09:00:00.000Z",
    kind: "create",
  });

  const same = await postJson({
    track: "Stay",
    artist: "Ada",
    listenUrl: "https://example.com/stay",
    amountUsd: 8,
  });
  assert.equal(same.status, 400);
  assert.deepEqual(await same.json(), { error: "bid_not_higher" });

  const lower = await postJson({
    track: "Stay",
    artist: "Ada",
    listenUrl: "https://example.com/stay",
    amountUsd: 5,
  });
  assert.equal(lower.status, 400);
  assert.deepEqual(await lower.json(), { error: "bid_not_higher" });

  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.bidUsd, 8);
  assert.equal(getPaymentPort().getCheckout("unused"), undefined);
});

test("same listen URL still inside last-7-days raises after the UTC week label rolls", async () => {
  const previousWeekNow = process.env.WEEK_NOW;
  const url = "https://example.com/sunday-raise";
  try {
    process.env.WEEK_NOW = "2026-08-16T12:00:00.000Z";
    const placed = applyPaidEvent({
      sessionId: "chk_sunday_5",
      weekId: "2026-W33",
      track: "Sunday Open",
      artist: "Ada",
      listenUrl: url,
      amountUsd: 5,
      paidAt: "2026-08-16T12:00:00.000Z",
      kind: "create",
    });
    assert.equal(placed.weekId, "2026-W33");
    assert.equal(placed.firstPaidAt, "2026-08-16T12:00:00.000Z");
    assert.equal(listingListenKey(url), url);

    process.env.WEEK_NOW = "2026-08-17T00:00:00.000Z";
    assert.equal(isoWeekId(nowUtc()), "2026-W34");
    assert.equal(listPaidForWeek("2026-W34").length, 0);
    const live = findPaidByListenUrl(url);
    assert.equal(live?.id, placed.id);
    assert.equal(live?.weekId, "2026-W33");
    assert.equal(getBoardListings().length, 1);
    assert.deepEqual(quoteBid(live, 7), {
      kind: "raise",
      targetBidUsd: 7,
      chargeUsd: 2,
    });

    const raiseJson = await postJson({
      track: "Sunday Raised",
      artist: "Ada",
      listenUrl: url,
      amountUsd: 7,
    });
    assert.equal(raiseJson.status, 200);
    const raiseBody = (await raiseJson.json()) as { sessionId: string };
    const raiseSession = getPaymentPort().getCheckout(raiseBody.sessionId);
    assert.equal(raiseSession?.kind, "raise");
    assert.equal(raiseSession?.amountUsd, 2);
    assert.equal(raiseSession?.listingDraft.weekId, "2026-W34");

    const paid = await getPaymentPort().completeCheckout(raiseBody.sessionId);
    const raised = applyPaidEvent({
      sessionId: paid.sessionId,
      weekId: paid.listingDraft.weekId,
      track: paid.listingDraft.track,
      artist: paid.listingDraft.artist,
      listenUrl: paid.listingDraft.listenUrl,
      amountUsd: paid.amountUsd,
      paidAt: paid.paidAt,
      kind: paid.kind,
    });
    assert.equal(raised.id, placed.id);
    assert.equal(raised.weekId, "2026-W33");
    assert.equal(raised.bidUsd, 7);
    assert.equal(raised.firstPaidAt, placed.firstPaidAt);
    assert.equal(raised.track, "Sunday Raised");

    process.env.WEEK_NOW = "2026-08-23T12:00:01.000Z";
    assert.equal(findPaidByListenUrl(url), undefined);
    assert.deepEqual(quoteBid(undefined, 5), {
      kind: "create",
      targetBidUsd: 5,
      chargeUsd: 5,
    });
    const aged = await postJson({
      track: "Sunday Open",
      artist: "Ada",
      listenUrl: url,
      amountUsd: 5,
    });
    assert.equal(aged.status, 200);
    const agedBody = (await aged.json()) as { sessionId: string };
    const agedSession = getPaymentPort().getCheckout(agedBody.sessionId);
    assert.equal(agedSession?.kind, "create");
    assert.equal(agedSession?.amountUsd, 5);
  } finally {
    if (previousWeekNow === undefined) {
      delete process.env.WEEK_NOW;
    } else {
      process.env.WEEK_NOW = previousWeekNow;
    }
  }
});

test("same listen URL after the rolling window is a new full-bid listing", () => {
  applyPaidEvent({
    sessionId: "chk_last_week",
    weekId: "2026-W33",
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    amountUsd: 20,
    paidAt: "2026-08-10T09:00:00.000Z",
    kind: "create",
  });
  const quote = quoteBid(undefined, 5);
  assert.equal(quote.kind, "create");
  assert.equal(quote.chargeUsd, 5);
  const next = applyPaidEvent({
    sessionId: "chk_this_week",
    weekId: weekId(),
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    amountUsd: 5,
    paidAt: "2026-08-17T09:00:00.000Z",
    kind: "create",
  });
  assert.equal(next.bidUsd, 5);
  assert.equal(next.weekId, weekId());
  assert.equal(getBoardListings().length, 1);
  assert.equal(listPaidForWeek("2026-W33")[0]?.bidUsd, 20);
});
