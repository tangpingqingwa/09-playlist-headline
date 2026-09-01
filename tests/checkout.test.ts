import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { POST as postCheckout } from "../src/app/api/checkout/route";
import { POST as postWebhook } from "../src/app/api/waffo/webhook/route";
import ReturnPage from "../src/app/return/page";
import { resolveReturn } from "../src/app/return/return-state";
import { FixturePayment } from "../src/billing/fixture";
import {
  CheckoutError,
  createPaymentPort,
  getPaymentPort,
  parseAmountUsd,
  resetPaymentPort,
} from "../src/billing/port";
import { isSafePublicHttpsUrl } from "../src/core/url";
import { waffoApiBase, WAFFO_OFFICIAL_API_BASE } from "../src/config";
import {
  ListingError,
  listingListenKey,
  parseTargetBidUsd,
  quoteBid,
} from "../src/core/listing";
import { createElement } from "react";
import HomePage from "../src/app/page";
import { getBoardListings, MIN_BID_USD, rankListings } from "../src/core/rank";
import {
  applyPaidEvent,
  findPaidByListenUrl,
  listPaidForWeek,
  listUnpaid,
  getStore,
  resetListings,
} from "../src/core/store";
import { currentWeekUtc, isoWeekId, nowUtc } from "../src/core/week";
import { claimantTokenHash } from "../src/core/claimant";

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

const { Board } = HomePage;
const LEGACY_CLAIMANT_TOKEN = "a".repeat(43);
const LEGACY_CLAIMANT_HASH = claimantTokenHash(LEGACY_CLAIMANT_TOKEN) as string;

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

function intentFromLocation(response: Response): string {
  const value = new URL(response.headers.get("location") ?? "", "http://localhost")
    .searchParams.get("intent");
  assert.ok(value);
  return value;
}

function fixtureSessionForIntent(intentId: string): string {
  const intent = getStore().getCheckoutIntent(intentId);
  assert.ok(intent?.providerCheckoutId);
  return intent.providerCheckoutId;
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

async function postJson(
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return postCheckout(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }),
  );
}

test("createPaymentPort requires an explicit Waffo mode and keeps fixture opt-in", () => {
  assert.throws(() => createPaymentPort({}), /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.throws(() => createPaymentPort({ LEGACY_PROVIDER_LIVE: "1" }), /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.equal(createPaymentPort({ WAFFO_MODE: "fixture" }).kind, "fixture");
  assert.throws(
    () => createPaymentPort({ WAFFO_MODE: "waffo-test" }),
    /BLOCKED-CONFIG: WAFFO_MERCHANT_ID/,
  );
});

test("Waffo modes are explicit and production pins the official API", () => {
  assert.equal(waffoApiBase({ WAFFO_MODE: "fixture" }), WAFFO_OFFICIAL_API_BASE);
  assert.equal(waffoApiBase({ WAFFO_MODE: "waffo-test", WAFFO_API_BASE: "https://test.example" }), "https://test.example");
  assert.equal(waffoApiBase({ WAFFO_MODE: "waffo-test", WAFFO_API_BASE: "https://attacker.example" }), "https://attacker.example");
  assert.throws(
    () => waffoApiBase({ WAFFO_MODE: "waffo-prod", WAFFO_API_BASE: "https://attacker.example" }),
    /official Waffo origin/,
  );
  assert.throws(
    () => waffoApiBase({ WAFFO_MODE: "waffo-test", WAFFO_API_BASE: "http://127.0.0.1:3000" }),
    /public HTTPS/,
  );
  assert.equal(isSafePublicHttpsUrl("https://example.com/checkout/id"), true);
  assert.equal(isSafePublicHttpsUrl("http://checkout.example.com/id"), false);
  assert.equal(isSafePublicHttpsUrl("https://127.0.0.1/id"), false);
  assert.equal(isSafePublicHttpsUrl("https://user:pass@example.com/id"), false);
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

test("unpaid Waffo checkout stays off the station desk until Waffo reports paid", async () => {
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
  assert.match(html, /An incomplete checkout stays off this desk/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /Bid USD/);
  assert.doesNotMatch(html, /Ghost Track/);
  assert.doesNotMatch(html, /Vapor/);
  assert.doesNotMatch(html, /\$99/);
  assert.doesNotMatch(html, /data-prize=/);
  assert.doesNotMatch(html, /Hear last 7 days/);

  const intentId = intentFromLocation(started);
  const sessionId = fixtureSessionForIntent(intentId);
  const expired = await postWebhook(
    new Request("http://localhost/api/waffo/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "checkout.updated",
        data: { id: sessionId, status: "expired" },
      }),
    }),
  );
  assert.equal(expired.status, 200);
  assert.deepEqual(await expired.json(), {
    received: true,
    applied: false,
    reason: "checkout_not_paid",
  });
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

test("POST /checkout $5 then Waffo return stays pending until a paid event", async () => {
  const started = await postForm({
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    amountUsd: "5",
  });
  assert.equal(started.status, 303);
  const location = started.headers.get("location") ?? "";
  assert.match(location, /\/checkout\/complete\?intent=/);
  assert.equal(getBoardListings().length, 0);

  const intentId = intentFromLocation(started);
  const result = resolveReturn({ intent: intentId });
  assert.equal(result.status, "pending");
  const ranked = rankListings(getBoardListings());
  assert.equal(ranked.length, 0);
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
  const started = await postForm({
    track: "Webhook Open",
    artist: "Ada",
    listenUrl: "https://example.com/webhook-open",
    amountUsd: "5",
  });
  const intentId = intentFromLocation(started);
  const sessionId = fixtureSessionForIntent(intentId);
  const paidBody = JSON.stringify({
    type: "order.completed",
    data: {
      checkoutId: sessionId,
      status: "succeeded",
      eventId: "event_fixture_paid",
      paymentId: "payment_fixture_paid",
      orderId: "order_fixture_paid",
      timestamp: "2026-08-20T12:00:00.000Z",
    },
  });
  const paid = await postWebhook(
    new Request("http://localhost/api/waffo/webhook", {
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
    new Request("http://localhost/api/waffo/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: paidBody,
    }),
  );
  assert.equal(again.status, 200);
  assert.equal(getBoardListings().length, 1);

  const expired = await postWebhook(
    new Request("http://localhost/api/waffo/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "order.completed",
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
  assert.deepEqual(await expired.json(), {
    received: true,
    applied: false,
    reason: "unknown_checkout",
  });
  assert.equal(getBoardListings().length, 1);
});

test("retired provider webhook is an inert compatibility tombstone", async () => {
  const { POST: postPolarWebhook } = await import("../src/app/api/polar/webhook/route");
  const response = await postPolarWebhook();
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: "waffo_webhook_required" });
  assert.equal(getBoardListings().length, 0);
});

test("Waffo production configuration fails closed before any provider call", () => {
  assert.throws(
    () => createPaymentPort({ WAFFO_MODE: "waffo-prod", DATABASE_PATH: "/tmp/playlist.sqlite" }),
    /BLOCKED-CONFIG: WAFFO_MERCHANT_ID/,
  );
  assert.throws(
    () => waffoApiBase({ WAFFO_MODE: "waffo-prod", WAFFO_API_BASE: "https://attacker.example" }),
    /official Waffo origin/,
  );
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
  const providerPaid = await getPaymentPort().completeCheckout(started.sessionId);
  applyPaidEvent({
    sessionId: providerPaid.sessionId,
    intentId: providerPaid.intentId,
    weekId: providerPaid.listingDraft.weekId,
    track: providerPaid.listingDraft.track,
    artist: providerPaid.listingDraft.artist,
    listenUrl: providerPaid.listingDraft.listenUrl,
    amountUsd: providerPaid.amountUsd,
    amountCents: providerPaid.amountCents,
    paidAt: providerPaid.paidAt,
    kind: providerPaid.kind,
    providerCheckoutId: providerPaid.providerCheckoutId,
    currency: providerPaid.currency,
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

test("fresh claimant cannot purchase an incumbent difference or replace its facts", async () => {
  const payload = {
    track: "Owned Opener",
    artist: "Ada",
    listenUrl: "https://example.com/owned-opener",
    amountUsd: 5,
  };
  const initial = await postJson(payload);
  assert.equal(initial.status, 200);
  const claimantCookie = initial.headers.get("set-cookie") ?? "";
  assert.match(claimantCookie, /^playlist_headline_claimant=[A-Za-z0-9_-]{43};/);
  const initialBody = (await initial.json()) as { sessionId: string };
  const providerPaid = await getPaymentPort().completeCheckout(initialBody.sessionId);
  applyPaidEvent({
    sessionId: providerPaid.sessionId,
    intentId: providerPaid.intentId,
    weekId: providerPaid.listingDraft.weekId,
    track: providerPaid.listingDraft.track,
    artist: providerPaid.listingDraft.artist,
    listenUrl: providerPaid.listingDraft.listenUrl,
    amountUsd: providerPaid.amountUsd,
    amountCents: providerPaid.amountCents,
    paidAt: providerPaid.paidAt,
    kind: providerPaid.kind,
    currency: providerPaid.currency,
    productId: providerPaid.productId,
    metadata: providerPaid.metadata,
    providerCheckoutId: providerPaid.providerCheckoutId,
  });
  assert.equal(getBoardListings()[0]?.track, "Owned Opener");

  const fresh = await postJson({ ...payload, track: "Attacker Replaced", amountUsd: 12 });
  assert.equal(fresh.status, 409);
  assert.deepEqual(await fresh.json(), { error: "not_owner" });
  assert.equal(getBoardListings()[0]?.track, "Owned Opener");
  assert.equal(getBoardListings()[0]?.bidUsd, 5);

  const owner = await postJson(
    { ...payload, amountUsd: 12 },
    { cookie: claimantCookie.split(";", 1)[0] ?? "" },
  );
  assert.equal(owner.status, 200);
  const ownerBody = (await owner.json()) as { sessionId: string };
  assert.equal(getPaymentPort().getCheckout(ownerBody.sessionId)?.amountUsd, 7);
  assert.equal(getBoardListings()[0]?.bidUsd, 5);
});

test("returning claimant cookie can create a different fresh listing", async () => {
  const initial = await postJson({
    track: "First Opener",
    artist: "Ada",
    listenUrl: "https://example.com/first-opener",
    amountUsd: 5,
  });
  assert.equal(initial.status, 200);
  const claimantCookie = initial.headers.get("set-cookie") ?? "";
  assert.match(claimantCookie, /^playlist_headline_claimant=[A-Za-z0-9_-]{43};/);

  const second = await postJson(
    {
      track: "Second Opener",
      artist: "Grace",
      listenUrl: "https://example.com/second-opener",
      amountUsd: 5,
    },
    { cookie: claimantCookie.split(";", 1)[0] ?? "" },
  );

  assert.equal(second.status, 200);
  const body = (await second.json()) as { sessionId?: string };
  assert.ok(body.sessionId);
  assert.equal(listUnpaid(weekId()).length, 2);
});

test("legacy unowned incumbent fails closed before a fresh difference checkout", async () => {
  applyPaidEvent({
    sessionId: "legacy-unowned",
    weekId: weekId(),
    track: "Legacy Opener",
    artist: "Ada",
    listenUrl: "https://example.com/legacy-opener",
    amountUsd: 5,
    paidAt: "2026-08-20T10:00:00.000Z",
    kind: "create",
  });

  const response = await postJson({
    track: "Legacy Opener",
    artist: "Ada",
    listenUrl: "https://example.com/legacy-opener",
    amountUsd: 12,
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "not_owner" });
  assert.equal(getBoardListings()[0]?.bidUsd, 5);
  assert.equal(listUnpaid(weekId()).length, 0);
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
      claimantTokenHash: LEGACY_CLAIMANT_HASH,
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
      claimantTokenHash: LEGACY_CLAIMANT_HASH,
  });
  const before = rankListings(getBoardListings());
  assert.equal(before[0]?.id, incumbent.id);
  assert.equal(before[1]?.id, opener.id);
  assert.equal(before[1]?.bidUsd, 5);

  const raiseJson = await postJson(
    {
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      amountUsd: 12,
    },
    { cookie: `playlist_headline_claimant=${LEGACY_CLAIMANT_TOKEN}` },
  );
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
    claimantTokenHash: LEGACY_CLAIMANT_HASH,
  });

  const ownerHeaders = { cookie: `playlist_headline_claimant=${LEGACY_CLAIMANT_TOKEN}` };
  const same = await postJson(
    {
      track: "Stay",
      artist: "Ada",
      listenUrl: "https://example.com/stay",
      amountUsd: 8,
    },
    ownerHeaders,
  );
  assert.equal(same.status, 400);
  assert.deepEqual(await same.json(), { error: "bid_not_higher" });

  const lower = await postJson(
    {
      track: "Stay",
      artist: "Ada",
      listenUrl: "https://example.com/stay",
      amountUsd: 5,
    },
    ownerHeaders,
  );
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
      claimantTokenHash: LEGACY_CLAIMANT_HASH,
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

    const raiseJson = await postJson(
      {
        track: "Sunday Open",
        artist: "Ada",
        listenUrl: url,
        amountUsd: 7,
      },
      { cookie: `playlist_headline_claimant=${LEGACY_CLAIMANT_TOKEN}` },
    );
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
    assert.equal(raised.track, "Sunday Open");

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
  const previousWeekNow = process.env.WEEK_NOW;
  try {
    process.env.WEEK_NOW = "2026-08-16T12:00:00.000Z";
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
    process.env.WEEK_NOW = "2026-08-20T12:00:00.000Z";
    const next = applyPaidEvent({
      sessionId: "chk_this_week",
      weekId: weekId(),
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      amountUsd: 5,
      paidAt: "2026-08-20T09:00:00.000Z",
      kind: "create",
    });
    assert.equal(next.bidUsd, 5);
    assert.equal(next.weekId, weekId());
    assert.equal(getBoardListings().length, 1);
    assert.equal(listPaidForWeek("2026-W33")[0]?.bidUsd, 20);
  } finally {
    if (previousWeekNow === undefined) delete process.env.WEEK_NOW;
    else process.env.WEEK_NOW = previousWeekNow;
  }
});
