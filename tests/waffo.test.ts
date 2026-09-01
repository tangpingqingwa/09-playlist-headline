import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, afterEach, test } from "node:test";
import { MAX_WAFFO_CHECKOUT_TTL_MS, WaffoPayment } from "../src/billing/waffo";
import { createPaymentPort } from "../src/billing/port";
import { databasePath, requireHttpsPublicBaseUrl, waffoMode } from "../src/config";
import { createStore, type CheckoutIntent, type PaidBid, type Store } from "../src/core/store";

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

const MERCHANT_ID = "MER_2D5F8G3H1K4M6N9P0Q7R8S";
const STORE_ID = "STO_2D5F8G3H1K4M6N9P0Q7R8S";
const PRODUCT_ID = "PROD_2D5F8G3H1K4M6N9P0Q7R8S";
const LISTING = {
  track: "Cold Open",
  artist: "Ada",
  listenUrl: "https://example.com/cold-open",
  weekId: "2026-W34",
};

const requestKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const requestPrivateKey = requestKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const webhookKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const webhookPrivateKey = webhookKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const webhookPublicKey = webhookKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const TEST_CLAIMANT_HASH = "a".repeat(64);

const stores: Store[] = [];
const roots: string[] = [];

// Node 22 can exit an otherwise idle worker while the production timeout's
// deliberately unref'd deadline is the only pending handle. Keep this test
// worker alive so timeout/recovery promises settle before the hook clears it.
const testKeepAlive = setInterval(() => undefined, 1_000);
after(() => clearInterval(testKeepAlive));

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Waffo mode is explicit and production cannot use fixture or memory", () => {
  assert.throws(() => waffoMode({ PAYMENT_MODE: "fixture" }), /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.throws(
    () => createPaymentPort({ WAFFO_MODE: "fixture", NODE_ENV: "production" }),
    /BLOCKED-CONFIG: WAFFO_MODE/,
  );
  assert.throws(
    () => databasePath({ WAFFO_MODE: "waffo-prod", DATABASE_PATH: ":memory:" }),
    /BLOCKED-CONFIG: DATABASE_PATH/,
  );
});

test("production public base is an origin and live keys/IDs are mode-scoped", () => {
  assert.equal(
    requireHttpsPublicBaseUrl({ WAFFO_MODE: "waffo-test", PUBLIC_BASE_URL: "http://localhost:3000/" }),
    "http://localhost:3000",
  );
  for (const value of [
    "https://radio.example/path",
    "https://radio.example/?from=checkout",
    "https://user:pass@radio.example",
  ]) {
    assert.throws(
      () => requireHttpsPublicBaseUrl({ WAFFO_MODE: "waffo-prod", PUBLIC_BASE_URL: value }),
      /BLOCKED-CONFIG: PUBLIC_BASE_URL/,
    );
  }

  const root = mkdtempSync(join(tmpdir(), "playlist-waffo-config-"));
  roots.push(root);
  assert.throws(
    () => new WaffoPayment({
      env: env(join(root, "ids.sqlite"), { WAFFO_STORE_ID: "STO_invalid" }),
      webhookPublicKey,
    }),
    /BLOCKED-CONFIG: WAFFO_STORE_ID/,
  );
  assert.throws(
    () => new WaffoPayment({
      env: env(join(root, "key.sqlite"), {
        WAFFO_WEBHOOK_TEST_PUBLIC_KEY: undefined,
        WAFFO_WEBHOOK_PUBLIC_KEY: webhookPublicKey,
      }),
    }),
    /BLOCKED-CONFIG: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
});

function store(): Store {
  const root = mkdtempSync(join(tmpdir(), "playlist-waffo-"));
  roots.push(root);
  const value = createStore(join(root, "board.sqlite"));
  stores.push(value);
  return value;
}

function env(path: string, extra: Record<string, string | undefined> = {}) {
  return {
    WAFFO_MODE: "waffo-test",
    WAFFO_MERCHANT_ID: MERCHANT_ID,
    WAFFO_STORE_ID: STORE_ID,
    WAFFO_PRODUCT_ID: PRODUCT_ID,
    WAFFO_PRIVATE_KEY: requestPrivateKey,
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: webhookPublicKey,
    DATABASE_PATH: path,
    PUBLIC_BASE_URL: "http://localhost:3000",
    ...extra,
  };
}

function intent(value: Store, id: string, overrides: Partial<{
  kind: "create" | "raise";
  currentBidCents: number;
  targetBidCents: number;
  chargeCents: number;
  listing: typeof LISTING;
}> = {}): CheckoutIntent {
  const listing = overrides.listing ?? LISTING;
  return value.createCheckoutIntent({
    intentId: id,
    listingDraft: listing,
    kind: overrides.kind ?? "create",
    currentBidCents: overrides.currentBidCents ?? 0,
    targetBidCents: overrides.targetBidCents ?? 500,
    chargeCents: overrides.chargeCents ?? 500,
    currency: "USD",
    productId: PRODUCT_ID,
    mode: "waffo-test",
    taxCategory: "digital_goods",
    claimantTokenHash: TEST_CLAIMANT_HASH,
    createdAt: "2026-08-20T09:00:00.000Z",
  });
}

async function checkout(
  value: Store,
  id: string,
  fetchFn: typeof fetch,
): Promise<{ payment: WaffoPayment; calls: Array<{ url: string; body: Record<string, unknown> }> }> {
  const created = value.getCheckoutIntent(id) ?? intent(value, id);
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const payment = new WaffoPayment({
    env: env(value.databasePath),
    fetch: async (input, init) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      calls.push({ url: String(input), body: JSON.parse(raw) as Record<string, unknown> });
      return fetchFn(input, init);
    },
    store: value,
    webhookPublicKey,
  });
  await payment.createCheckout({
    listingDraft: {
      track: created.track,
      artist: created.artist,
      listenUrl: created.listenUrl,
      weekId: created.weekId,
    },
    amountUsd: created.chargeCents / 100,
    amountCents: created.chargeCents,
    kind: created.kind,
    intentId: created.intentId,
    metadata: created.metadata,
  });
  return { payment, calls };
}

function checkoutResponse(sessionId: string): typeof fetch {
  return async () => new Response(JSON.stringify({
    data: {
      sessionId,
      checkoutUrl: `https://pancake.waffo.ai/store/playlist-headline/checkout/${sessionId}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function checkoutResponseWithUrl(sessionId: string, checkoutUrl: string): typeof fetch {
  return async () => new Response(JSON.stringify({
    data: { sessionId, checkoutUrl, expiresAt: new Date(Date.now() + 60_000).toISOString() },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function eventFor(local: CheckoutIntent, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "delivery-1",
    timestamp: "2026-08-20T10:00:00.000Z",
    eventType: "order.completed",
    eventId: "payment-1",
    storeId: STORE_ID,
    storeName: "Playlist Headline",
    mode: "test",
    data: {
      orderId: "order-1",
      checkoutId: local.providerCheckoutId ?? "checkout-signed",
      orderStatus: "completed",
      buyerEmail: "listener@example.com",
      orderMerchantExternalId: local.intentId,
      currency: "USD",
      amount: `${(local.chargeCents / 100).toFixed(2)}`,
      taxAmount: "0.00",
      subtotal: `${(local.chargeCents / 100).toFixed(2)}`,
      productId: local.productId,
      productName: "Rank",
      paymentId: "payment-1",
      paymentStatus: "succeeded",
      orderMetadata: local.metadata,
      ...overrides,
    },
  };
}

function signed(value: Record<string, unknown>, timestamp = String(Date.now())): {
  raw: string;
  headers: Record<string, string>;
} {
  const raw = JSON.stringify(value);
  const signature = createSign("RSA-SHA256")
    .update(`${timestamp}.${raw}`)
    .end()
    .sign(webhookPrivateKey, "base64");
  return {
    raw,
    headers: { "x-waffo-signature": `t=${timestamp},v1=${signature}` },
  };
}

function paidFor(local: CheckoutIntent, overrides: Partial<PaidBid> = {}): PaidBid {
  return {
    sessionId: local.intentId,
    intentId: local.intentId,
    weekId: local.weekId,
    track: local.track,
    artist: local.artist,
    listenUrl: local.listenUrl,
    amountUsd: local.chargeCents / 100,
    amountCents: local.chargeCents,
    kind: local.kind,
    paidAt: "2026-08-20T10:00:00.000Z",
    currency: "USD",
    productId: PRODUCT_ID,
    metadata: local.metadata,
    metadataFingerprint: local.metadataFingerprint,
    providerCheckoutId: local.providerCheckoutId,
    providerDeliveryId: `delivery-${local.intentId}`,
    providerEventId: `payment-${local.intentId}`,
    providerPaymentId: `payment-${local.intentId}`,
    providerOrderId: `order-${local.intentId}`,
    providerEventType: "order.completed",
    rawBodyHash: `raw-${local.intentId}`,
    ...overrides,
  };
}

function paidBidFromEvent(event: import("../src/billing/port").PaidEvent): PaidBid {
  return {
    sessionId: event.sessionId,
    intentId: event.intentId,
    weekId: event.listingDraft.weekId,
    track: event.listingDraft.track,
    artist: event.listingDraft.artist,
    listenUrl: event.listingDraft.listenUrl,
    amountUsd: event.amountUsd,
    amountCents: event.amountCents,
    kind: event.kind,
    paidAt: event.paidAt,
    currency: event.currency,
    productId: event.productId,
    metadata: event.metadata,
    metadataFingerprint: event.metadataFingerprint,
    providerCheckoutId: event.providerCheckoutId,
    providerDeliveryId: event.providerDeliveryId,
    providerEventId: event.providerEventId,
    providerPaymentId: event.providerPaymentId,
    providerOrderId: event.providerOrderId,
    providerEventType: event.providerEventType,
    rawBodyHash: event.rawBodyHash,
    eventFingerprint: event.eventFingerprint,
  };
}

test("Waffo anonymous checkout sends exact decimal product, metadata, and external intent", async () => {
  const value = store();
  const local = intent(value, "intent-request");
  let sawCreating = false;
  const started = await checkout(value, local.intentId, async (input, init) => {
    sawCreating = value.getCheckoutIntent(local.intentId)?.lifecycle === "creating";
    return checkoutResponse("checkout-request")(input, init);
  });
  assert.equal(sawCreating, true);
  assert.equal(started.calls.length, 1);
  assert.equal(started.calls[0]?.url, "https://api.waffo.ai/v1/actions/checkout/create-session");
  assert.deepEqual(started.calls[0]?.body, {
    productId: PRODUCT_ID,
    currency: "USD",
    priceSnapshot: { amount: "5.00", taxCategory: "digital_goods" },
    successUrl: `http://localhost:3000/checkout/complete?intent=${encodeURIComponent(local.intentId)}`,
    orderMerchantExternalId: local.intentId,
    metadata: local.metadata,
  });
  assert.equal(value.getCheckoutIntent(local.intentId)?.providerCheckoutId, "checkout-request");
  assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "open");
  const replay = await checkout(value, local.intentId, async (input, init) =>
    checkoutResponse("should-not-be-called")(input, init),
  );
  assert.equal(replay.payment.getCheckout("checkout-request")?.intentId, local.intentId);
  assert.equal(replay.calls.length, 0);
  await assert.rejects(
    started.payment.createCheckout({
      listingDraft: LISTING,
      amountUsd: 5,
      amountCents: 600,
      kind: "create",
      intentId: local.intentId,
      metadata: local.metadata,
    }),
    /amount_mismatch/,
  );
});

test("Waffo provider response fields are guarded and expiry is canonical and bounded", async () => {
  const cases: Array<[string, unknown]> = [
    ["null-response", null],
    ["wrong-session-type", {
      sessionId: 42,
      checkoutUrl: "https://pancake.waffo.ai/store/playlist-headline/checkout/wrong-session-type",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }],
    ["wrong-expiry-type", {
      sessionId: "wrong-expiry-type",
      checkoutUrl: "https://pancake.waffo.ai/store/playlist-headline/checkout/wrong-expiry-type",
      expiresAt: 123,
    }],
    ["noncanonical-expiry", {
      sessionId: "noncanonical-expiry",
      checkoutUrl: "https://pancake.waffo.ai/store/playlist-headline/checkout/noncanonical-expiry",
      expiresAt: new Date(Date.now() + 60_000).toISOString().replace("Z", "+00:00"),
    }],
    ["too-far-expiry", {
      sessionId: "too-far-expiry",
      checkoutUrl: "https://pancake.waffo.ai/store/playlist-headline/checkout/too-far-expiry",
      expiresAt: new Date(Date.now() + MAX_WAFFO_CHECKOUT_TTL_MS + 1_000).toISOString(),
    }],
  ];
  for (const [name, response] of cases) {
    const value = store();
    const local = intent(value, `intent-response-${name}`);
    const payment = new WaffoPayment({
      env: env(value.databasePath),
      store: value,
      webhookPublicKey,
      fetch: async () => new Response(JSON.stringify({ data: response }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });
    await assert.rejects(
      payment.createCheckout({
        listingDraft: LISTING,
        amountUsd: 5,
        amountCents: 500,
        kind: "create",
        intentId: local.intentId,
        metadata: local.metadata,
      }),
      /waffo_ambiguous/,
    );
    assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "unknown");
  }
});

test("Waffo timeout remains an unknown recoverable intent and performs no settlement", async () => {
  const value = store();
  const local = intent(value, "intent-timeout");
  const payment = new WaffoPayment({
    env: env(value.databasePath, { WAFFO_TIMEOUT_MS: "5" }),
    store: value,
    webhookPublicKey,
    fetch: async () => new Promise<Response>(() => undefined),
  });
  await assert.rejects(
    payment.createCheckout({
      listingDraft: LISTING,
      amountUsd: 5,
      amountCents: 500,
      kind: "create",
      intentId: local.intentId,
      metadata: local.metadata,
    }),
    /waffo_ambiguous/,
  );
  assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "unknown");
  assert.equal(value.listPaidInRollingWeek().length, 0);

  const recovered = await checkout(value, local.intentId, checkoutResponse("checkout-recovered"));
  assert.equal(recovered.calls.length, 1);
  assert.equal(value.getCheckoutIntent(local.intentId)?.providerCheckoutId, "checkout-recovered");
});

test("transient and malformed Waffo responses remain unknown through the body deadline", async () => {
  for (const status of [408, 409, 425, 429]) {
    const value = store();
    const local = intent(value, `intent-transient-${status}`);
    const payment = new WaffoPayment({
      env: env(value.databasePath),
      store: value,
      webhookPublicKey,
      fetch: async () => new Response(JSON.stringify({ errors: [{ message: "retry" }] }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    });
    await assert.rejects(
      payment.createCheckout({
        listingDraft: LISTING,
        amountUsd: 5,
        amountCents: 500,
        kind: "create",
        intentId: local.intentId,
        metadata: local.metadata,
      }),
      /waffo_ambiguous/,
    );
    assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "unknown");
  }

  const nonJsonStore = store();
  const nonJsonIntent = intent(nonJsonStore, "intent-non-json");
  const nonJsonPayment = new WaffoPayment({
    env: env(nonJsonStore.databasePath),
    store: nonJsonStore,
    webhookPublicKey,
    fetch: async () => new Response("upstream unavailable", { status: 400 }),
  });
  await assert.rejects(
    nonJsonPayment.createCheckout({
      listingDraft: LISTING,
      amountUsd: 5,
      amountCents: 500,
      kind: "create",
      intentId: nonJsonIntent.intentId,
      metadata: nonJsonIntent.metadata,
    }),
    /waffo_ambiguous/,
  );
  assert.equal(nonJsonStore.getCheckoutIntent(nonJsonIntent.intentId)?.lifecycle, "unknown");

  const bodyStore = store();
  const bodyIntent = intent(bodyStore, "intent-body-stall");
  const bodyPayment = new WaffoPayment({
    env: env(bodyStore.databasePath, { WAFFO_TIMEOUT_MS: "10" }),
    store: bodyStore,
    webhookPublicKey,
    fetch: async () => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => new Promise<unknown>(() => undefined),
    } as unknown as Response),
  });
  const startedAt = Date.now();
  await assert.rejects(
    bodyPayment.createCheckout({
      listingDraft: LISTING,
      amountUsd: 5,
      amountCents: 500,
      kind: "create",
      intentId: bodyIntent.intentId,
      metadata: bodyIntent.metadata,
    }),
    /waffo_ambiguous/,
  );
  assert.ok(Date.now() - startedAt < 500);
  assert.equal(bodyStore.getCheckoutIntent(bodyIntent.intentId)?.lifecycle, "unknown");
});

test("malformed Waffo error envelopes remain unknown and recoverable", async () => {
  const cases: Array<[string, unknown]> = [
    ["null-entry", [null]],
    ["wrong-message-type", [{ layer: "provider", message: 17 }]],
    ["non-array-envelope", "provider rejected"],
  ];
  for (const [name, errors] of cases) {
    const value = store();
    const local = intent(value, `intent-malformed-error-${name}`);
    const payment = new WaffoPayment({
      env: env(value.databasePath),
      store: value,
      webhookPublicKey,
      fetch: async () => new Response(JSON.stringify({ errors }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    });
    await assert.rejects(
      payment.createCheckout({
        listingDraft: LISTING,
        amountUsd: 5,
        amountCents: 500,
        kind: "create",
        intentId: local.intentId,
        metadata: local.metadata,
      }),
      /waffo_ambiguous/,
    );
    assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "unknown");
    assert.equal(value.listPaidInRollingWeek().length, 0);
  }
});

test("signed Waffo order.completed settles once and exact retry is a no-op", async () => {
  const value = store();
  const local = intent(value, "intent-signed");
  const payment = (await checkout(value, local.intentId, checkoutResponse("checkout-signed"))).payment;
  const signedEvent = signed(eventFor(value.getCheckoutIntent(local.intentId) as CheckoutIntent));
  const first = await payment.handleWebhook(signedEvent.raw, signedEvent.headers);
  if ("ignored" in first) throw new Error("valid event was ignored");
  const listing = value.applyPaidEvent(paidBidFromEvent(first));
  assert.equal(payment.getCheckout("checkout-signed")?.status, "paid");
  const replay = await payment.handleWebhook(signedEvent.raw, signedEvent.headers);
  if ("ignored" in replay) throw new Error("exact retry was ignored");
  const replayed = value.applyPaidEvent(paidBidFromEvent(replay));
  assert.equal(replayed.id, listing.id);
  assert.equal(value.listPaidInRollingWeek().length, 1);
  assert.equal((value.db.prepare("SELECT COUNT(*) AS count FROM payments").get() as { count: number }).count, 1);
  assert.equal((value.db.prepare("SELECT COUNT(*) AS count FROM payment_events").get() as { count: number }).count, 1);
});

test("signed Waffo order.completed can correlate by external intent without checkoutId", async () => {
  const value = store();
  const local = intent(value, "intent-external-only");
  const payment = (await checkout(value, local.intentId, checkoutResponse("checkout-external-only"))).payment;
  const candidate = eventFor(value.getCheckoutIntent(local.intentId) as CheckoutIntent);
  const data = { ...(candidate.data as Record<string, unknown>) };
  delete data.checkoutId;
  const envelope = signed({
    ...candidate,
    id: "delivery-external-only",
    eventId: "payment-external-only",
    data: { ...data, paymentId: "payment-external-only" },
  });
  const verified = await payment.handleWebhook(envelope.raw, envelope.headers);
  if ("ignored" in verified) throw new Error("valid event was ignored");
  const listing = value.applyPaidEvent(paidBidFromEvent(verified));
  assert.equal(listing.bidUsd, 5);
  assert.equal(value.listPaidInRollingWeek().length, 1);
});

test("Waffo rejects invalid signature, wrong status/facts, and unknown intents without ranking", async () => {
  const value = store();
  const local = intent(value, "intent-negative");
  const payment = (await checkout(value, local.intentId, checkoutResponse("checkout-negative"))).payment;
  const attached = value.getCheckoutIntent(local.intentId) as CheckoutIntent;
  const valid = eventFor(attached);
  const invalid = signed(valid);
  await assert.rejects(
    payment.handleWebhook(invalid.raw, { "x-waffo-signature": "t=0,v1=invalid" }),
    /invalid Waffo webhook signature/,
  );

  for (const [name, change] of [
    ["status", { paymentStatus: "failed" }],
    ["currency", { currency: "EUR" }],
    ["subtotal", { subtotal: "6.00" }],
    ["amount-type", { amount: 500 }],
    ["metadata", { orderMetadata: { ...local.metadata, track: "Tampered" } }],
  ] as const) {
    const candidate = eventFor(attached, { ...change });
    const envelope = signed({ ...candidate, id: `delivery-${name}`, eventId: `payment-${name}` });
    await assert.rejects(payment.handleWebhook(envelope.raw, envelope.headers));
  }

  const unknown = signed({
    ...eventFor(attached, {
      orderMerchantExternalId: "intent-does-not-exist",
      orderMetadata: { ...local.metadata, intentId: "intent-does-not-exist" },
      checkoutId: "checkout-unknown",
      orderId: "order-unknown",
      paymentId: "payment-unknown",
    }),
    id: "delivery-unknown",
    eventId: "payment-unknown",
  });
  const ignored = await payment.handleWebhook(unknown.raw, unknown.headers);
  assert.deepEqual(ignored, { ignored: true, reason: "unknown_intent", intentId: "intent-does-not-exist" });
  assert.equal(value.listPaidInRollingWeek().length, 0);
  assert.equal((value.db.prepare("SELECT COUNT(*) AS count FROM listings").get() as { count: number }).count, 0);
});

test("Waffo requires signed delivery and direct signed product facts", async () => {
  const value = store();
  const local = intent(value, "intent-required-facts");
  const payment = (await checkout(value, local.intentId, checkoutResponse("checkout-required-facts"))).payment;
  const attached = value.getCheckoutIntent(local.intentId) as CheckoutIntent;

  const missingDelivery = eventFor(attached, {
    paymentId: "payment-missing-delivery",
    orderId: "order-missing-delivery",
  });
  delete (missingDelivery as Record<string, unknown>).id;
  const noDelivery = signed(missingDelivery);
  await assert.rejects(
    payment.handleWebhook(noDelivery.raw, {
      ...noDelivery.headers,
      "webhook-id": "unsigned-header-delivery",
    }),
    /delivery_id_missing/,
  );

  const productStore = store();
  const productIntent = intent(productStore, "intent-required-product");
  const productPayment = (await checkout(productStore, productIntent.intentId, checkoutResponse("checkout-required-product"))).payment;
  const missingProduct = eventFor(productStore.getCheckoutIntent(productIntent.intentId) as CheckoutIntent, {
    paymentId: "payment-missing-product",
    orderId: "order-missing-product",
    productId: undefined,
  });
  const noProduct = signed({ ...missingProduct, id: "delivery-missing-product", eventId: "payment-missing-product" });
  await assert.rejects(productPayment.handleWebhook(noProduct.raw, noProduct.headers), /product_mismatch/);
  assert.equal(productStore.listPaidInRollingWeek().length, 0);
});

test("Waffo rejects contradictory signed subtotal, tax, amount, and total facts", async () => {
  const value = store();
  const local = intent(value, "intent-money-contradiction");
  const payment = (await checkout(value, local.intentId, checkoutResponse("checkout-money-contradiction"))).payment;
  const candidate = eventFor(value.getCheckoutIntent(local.intentId) as CheckoutIntent, {
    amount: "999.00",
    total: "999.00",
    subtotal: "5.00",
    taxAmount: "0.00",
  });
  const envelope = signed({
    ...candidate,
    id: "delivery-money-contradiction",
    eventId: "payment-money-contradiction",
    data: {
      ...(candidate.data as Record<string, unknown>),
      paymentId: "payment-money-contradiction",
    },
  });
  await assert.rejects(payment.handleWebhook(envelope.raw, envelope.headers), /amount_mismatch/);
  assert.equal(value.listPaidInRollingWeek().length, 0);
  assert.equal(
    (value.db.prepare("SELECT COUNT(*) AS count FROM listings").get() as { count: number }).count,
    0,
  );
});

test("stale and future signed captures reconcile without creating a listing", async () => {
  for (const [name, timestamp] of [
    ["stale", "2026-08-01T10:00:00.000Z"],
    ["before-intent", "2026-08-20T08:00:00.000Z"],
    ["future", "2026-08-21T10:00:00.000Z"],
  ] as const) {
    const value = store();
    const local = intent(value, `intent-${name}-capture`);
    const payment = (await checkout(value, local.intentId, checkoutResponse(`checkout-${name}-capture`))).payment;
    const envelope = signed({
     ...eventFor(value.getCheckoutIntent(local.intentId) as CheckoutIntent),
      timestamp,
   });
    const verified = await payment.handleWebhook(envelope.raw, envelope.headers);
    if ("ignored" in verified) throw new Error(`${name} event was ignored`);
    assert.throws(() => value.applyPaidEvent(paidBidFromEvent(verified)), /reconciliation_required/);
    assert.equal(value.listPaidInRollingWeek().length, 0);
    assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "needs_reconciliation");
    assert.equal(
      (value.db.prepare("SELECT outcome FROM payments").get() as { outcome: string }).outcome,
      "needs_reconciliation",
    );
  }
});

test("Waffo rejects insecure, private, and credential-bearing provider checkout URLs", async () => {
  for (const [name, checkoutUrl] of [
    ["http", "http://checkout.example/unsafe"],
    ["loopback", "https://127.0.0.1/unsafe"],
    ["private", "https://192.168.1.10/unsafe"],
    ["credentialed", "https://user:pass@checkout.example/unsafe"],
    ["evil-host", "https://evil.example/store/playlist-headline/checkout/checkout-url-evil-host"],
    ["wrong-path", "https://pancake.waffo.ai/checkout/checkout-url-wrong-path"],
    ["mismatched-session", "https://pancake.waffo.ai/store/playlist-headline/checkout/another-session"],
  ] as const) {
    const value = store();
    const local = intent(value, `intent-url-${name}`);
    const payment = new WaffoPayment({
      env: env(value.databasePath),
      store: value,
      webhookPublicKey,
      fetch: checkoutResponseWithUrl(`checkout-url-${name}`, checkoutUrl),
    });
    await assert.rejects(
      payment.createCheckout({
        listingDraft: LISTING,
        amountUsd: 5,
        amountCents: 500,
        kind: "create",
        intentId: local.intentId,
        metadata: local.metadata,
      }),
      /waffo_ambiguous/,
    );
    assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "unknown");
    assert.equal(value.listPaidInRollingWeek().length, 0);
  }

  for (const [name, expiresAt] of [
    ["missing-expiry", undefined],
    ["past-expiry", "2020-01-01T00:00:00.000Z"],
  ] as const) {
    const value = store();
    const local = intent(value, `intent-url-expiry-${name}`);
    const payment = new WaffoPayment({
      env: env(value.databasePath),
      store: value,
      webhookPublicKey,
      fetch: async () => new Response(JSON.stringify({
        data: {
          sessionId: `checkout-url-expiry-${name}`,
          checkoutUrl: `https://pancake.waffo.ai/store/playlist-headline/checkout/checkout-url-expiry-${name}`,
          ...(expiresAt ? { expiresAt } : {}),
        },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    await assert.rejects(
      payment.createCheckout({
        listingDraft: LISTING,
        amountUsd: 5,
        amountCents: 500,
        kind: "create",
        intentId: local.intentId,
        metadata: local.metadata,
      }),
      /waffo_ambiguous/,
    );
    assert.equal(value.getCheckoutIntent(local.intentId)?.lifecycle, "unknown");
  }
});

test("changed signed payload reusing a delivery or business id is rejected after settlement", async () => {
  const value = store();
  const local = intent(value, "intent-reuse");
  const payment = (await checkout(value, local.intentId, checkoutResponse("checkout-reuse"))).payment;
  const attached = value.getCheckoutIntent(local.intentId) as CheckoutIntent;
  const first = signed(eventFor(attached));
  const paid = await payment.handleWebhook(first.raw, first.headers);
  if ("ignored" in paid) throw new Error("valid event was ignored");
  value.applyPaidEvent(paidBidFromEvent(paid));

  const changed = signed({
    ...eventFor(value.getCheckoutIntent(local.intentId) as CheckoutIntent, { amount: "6.00", subtotal: "6.00" }),
    id: "delivery-1",
    eventId: "payment-1",
  });
  await assert.rejects(payment.handleWebhook(changed.raw, changed.headers), /event_reuse_mismatch|amount_mismatch/);
  assert.equal(value.listPaidInRollingWeek()[0]?.bidUsd, 5);
  assert.equal((value.db.prepare("SELECT COUNT(*) AS count FROM listings").get() as { count: number }).count, 1);
  assert.equal((value.db.prepare("SELECT COUNT(*) AS count FROM payment_events").get() as { count: number }).count, 2);
});

test("two independently quoted raises settle at $12 once; the stale capture reconciles instead of making $19", () => {
  const value = store();
  const opening = intent(value, "intent-opening");
  value.attachCheckoutIntent({ intentId: opening.intentId, providerCheckoutId: "checkout-opening" });
  const listing = value.applyPaidEvent(paidFor(value.getCheckoutIntent(opening.intentId) as CheckoutIntent));
  const raiseOne = intent(value, "intent-raise-one", {
    kind: "raise",
    currentBidCents: 500,
    targetBidCents: 1200,
    chargeCents: 700,
    listing: { ...LISTING },
  });
  const raiseTwo = intent(value, "intent-raise-two", {
    kind: "raise",
    currentBidCents: 500,
    targetBidCents: 1200,
    chargeCents: 700,
    listing: { ...LISTING },
  });
  value.attachCheckoutIntent({ intentId: raiseOne.intentId, providerCheckoutId: "checkout-raise-one" });
  value.attachCheckoutIntent({ intentId: raiseTwo.intentId, providerCheckoutId: "checkout-raise-two" });
  const raised = value.applyPaidEvent(paidFor(value.getCheckoutIntent(raiseOne.intentId) as CheckoutIntent));
  assert.equal(raised.id, listing.id);
  assert.equal(raised.bidUsd, 12);
  assert.equal(raised.firstPaidAt, listing.firstPaidAt);
  assert.throws(
    () => value.applyPaidEvent(paidFor(value.getCheckoutIntent(raiseTwo.intentId) as CheckoutIntent)),
    /reconciliation_required/,
  );
  assert.equal(value.getListingById(listing.id)?.bidUsd, 12);
  assert.equal((value.db.prepare("SELECT COUNT(*) AS count FROM payments WHERE outcome = 'needs_reconciliation'").get() as { count: number }).count, 1);
});
