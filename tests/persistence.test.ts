import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import { openDatabase } from "../src/db";
import { POST as postCheckout } from "../src/app/api/checkout/route";
import { POST as postWebhook } from "../src/app/api/waffo/webhook/route";
import { FixturePayment } from "../src/billing/fixture";
import { resetPaymentPort } from "../src/billing/port";
import { databasePath } from "../src/config";
import {
  createStore,
  getDb,
  resetListings,
  type PaidBid,
  type Store,
} from "../src/core/store";

const Database = createRequire(import.meta.url)(
  "better-sqlite3",
) as typeof import("better-sqlite3");

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryStore(): { store: Store; path: string } {
  const root = mkdtempSync(join(tmpdir(), "playlist-headline-"));
  tempRoots.push(root);
  const path = join(root, "board.sqlite");
  return { store: createStore(path), path };
}

function paid(overrides: Partial<PaidBid> = {}): PaidBid {
  return {
    sessionId: "checkout-1",
    providerCheckoutId: "waffo-checkout-1",
    providerEventId: "waffo-event-1",
    weekId: "2026-W34",
    track: "Cold Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open?utm_source=radio",
    amountUsd: 5,
    paidAt: "2026-08-20T10:00:00.000Z",
    kind: "create",
    ...overrides,
  };
}

test("DATABASE_PATH accepts an explicit SQLite path and defaults to the documented file", () => {
  assert.equal(databasePath({ DATABASE_PATH: " /tmp/playlist.sqlite " }), "/tmp/playlist.sqlite");
  assert.equal(databasePath({}), "./data/playlist-headline.sqlite");
});

function createLegacyDatabase(path: string): void {
  const db = new Database(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations (id, applied_at) VALUES
      ('001_durable_store.sql', '2026-08-20T00:00:00.000Z'),
      ('002_payment_events.sql', '2026-08-20T00:00:00.000Z'),
      ('003_intent_ledger.sql', '2026-08-20T00:00:00.000Z');
    CREATE TABLE listings (id TEXT PRIMARY KEY, track TEXT NOT NULL);
    INSERT INTO listings (id, track) VALUES ('legacy-listing', 'Legacy opener');
    CREATE TABLE checkout_intents (
      intent_id TEXT PRIMARY KEY,
      provider_checkout_id TEXT,
      checkout_url TEXT,
      expires_at TEXT,
      week_id TEXT,
      track TEXT,
      artist TEXT,
      listen_key TEXT,
      listen_url TEXT,
      kind TEXT,
      current_bid_cents INTEGER,
      target_bid_cents INTEGER,
      charge_cents INTEGER,
      currency TEXT,
      product_id TEXT,
      mode TEXT,
      tax_category TEXT,
      metadata_json TEXT,
      metadata_fingerprint TEXT,
      intent_fingerprint TEXT,
      lifecycle TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE payments (id TEXT PRIMARY KEY);
    CREATE TABLE payment_events (
      id INTEGER PRIMARY KEY,
      provider_checkout_id TEXT
    );
  `);
  db.close();
}

function openDatabaseInChild(path: string): Promise<void> {
  const dbModule = pathToFileURL(join(process.cwd(), "src/db.ts")).href;
  const script = [
    `import { openDatabase } from ${JSON.stringify(dbModule)};`,
    "const db = openDatabase(process.env.TEST_DATABASE_PATH);",
    "db.close();",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx/esm", "--eval", script],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TEST_DATABASE_PATH: path,
          WAFFO_MODE: "fixture",
          DATABASE_PATH: path,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`legacy database opener failed (${code ?? signal}): ${stderr}`));
    });
  });
}

test("near-concurrent legacy opens serialize column upgrades and preserve data", async () => {
  const root = mkdtempSync(join(tmpdir(), "playlist-legacy-migration-"));
  tempRoots.push(root);
  const legacyPath = join(root, "legacy.sqlite");
  createLegacyDatabase(legacyPath);

  const lock = new Database(legacyPath);
  lock.pragma("busy_timeout = 5000");
  lock.exec("BEGIN IMMEDIATE");
  const first = openDatabaseInChild(legacyPath);
  const second = openDatabaseInChild(legacyPath);
  await new Promise((resolve) => setTimeout(resolve, 100));
  lock.exec("ROLLBACK");
  lock.close();
  await Promise.all([first, second]);

  const migrated = new Database(legacyPath);
  const columns = (table: string): Set<string> => new Set(
    (migrated.pragma(`table_info(${table})`) as Array<{ name: string }>).map((row) => row.name),
  );
  assert.ok(columns("listings").has("claimant_token_hash"));
  assert.ok(columns("checkout_intents").has("claimant_token_hash"));
  assert.ok(columns("payments").has("provider_order_id"));
  assert.ok(columns("payment_events").has("provider_delivery_id"));
  assert.equal(
    (migrated.prepare("SELECT track FROM listings WHERE id = ?").get("legacy-listing") as { track: string }).track,
    "Legacy opener",
  );
  migrated.close();

  const fresh = createStore(join(root, "fresh.sqlite"));
  assert.equal(fresh.listPaidInRollingWeek().length, 0);
  fresh.close();
});

test("failed migration closes its handle and can be retried after repair", () => {
  const root = mkdtempSync(join(tmpdir(), "playlist-migration-retry-"));
  tempRoots.push(root);
  const path = join(root, "broken.sqlite");
  const broken = new Database(path);
  broken.exec(`
    CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations (id, applied_at) VALUES
      ('001_durable_store.sql', '2026-08-20T00:00:00.000Z'),
      ('002_payment_events.sql', '2026-08-20T00:00:00.000Z'),
      ('003_intent_ledger.sql', '2026-08-20T00:00:00.000Z');
    CREATE TABLE checkout_intents (intent_id TEXT PRIMARY KEY NOT NULL);
  `);
  broken.close();

  assert.throws(() => openDatabase(path));

  const repaired = new Database(path);
  repaired.exec("DROP TABLE checkout_intents; DELETE FROM schema_migrations;");
  repaired.close();

  const retried = openDatabase(path);
  assert.deepEqual(
    retried.prepare("SELECT 1 AS ok").get(),
    { ok: 1 },
  );
  retried.close();
});

test("paid claim survives a store restart and remains on the rolling board", () => {
  const first = temporaryStore();
  const created = first.store.applyPaidEvent(paid());
  assert.equal(first.store.listPaidInRollingWeek().length, 1);
  first.store.close();

  const restarted = createStore(first.path);
  const loaded = restarted.getListingById(created.id);
  assert.deepEqual(loaded, created);
  const replayed = restarted.applyPaidEvent(paid());
  assert.equal(replayed.id, created.id);
  assert.equal(restarted.listPaidInRollingWeek()[0]?.id, created.id);
  assert.equal(
    (restarted.db.prepare("SELECT COUNT(*) AS count FROM payments").get() as { count: number }).count,
    1,
  );
  assert.equal(
    (restarted.db.prepare("SELECT COUNT(*) AS count FROM payment_events").get() as { count: number }).count,
    1,
  );
  restarted.close();
});

test("fixture webhook rehydrates a durable checkout after adapter restart", async () => {
  const { store } = temporaryStore();
  const local = store.createCheckoutIntent({
    intentId: "fixture-restart-intent",
    listingDraft: {
      track: "Restart Opener",
      artist: "Ada",
      listenUrl: "https://example.com/restart-opener",
      weekId: "2026-W34",
    },
    kind: "create",
    currentBidCents: 0,
    targetBidCents: 500,
    chargeCents: 500,
    currency: "USD",
    productId: "fixture-product",
    mode: "fixture",
    createdAt: "2026-08-20T09:00:00.000Z",
  });
  store.attachCheckoutIntent({
    intentId: local.intentId,
    providerCheckoutId: "fixture-restart-checkout",
    checkoutUrl: "/checkout/complete?intent=fixture-restart-intent",
  });
  const adapter = new FixturePayment(store);
  const result = await adapter.handleWebhook(JSON.stringify({
    type: "order.completed",
    data: {
      checkoutId: "fixture-restart-checkout",
      status: "succeeded",
      eventId: "fixture-restart-event",
      paymentId: "fixture-restart-payment",
      orderId: "fixture-restart-order",
      timestamp: "2026-08-20T12:00:00.000Z",
    },
  }), {});
  assert.ok(!("ignored" in result));
  const listing = store.applyPaidEvent({
    sessionId: result.sessionId,
    intentId: result.intentId,
    weekId: result.listingDraft.weekId,
    track: result.listingDraft.track,
    artist: result.listingDraft.artist,
    listenUrl: result.listingDraft.listenUrl,
    amountUsd: result.amountUsd,
    amountCents: result.amountCents,
    kind: result.kind,
    paidAt: result.paidAt,
    currency: result.currency,
    providerCheckoutId: result.providerCheckoutId,
    providerEventType: result.providerEventType,
    providerEventId: result.providerEventId,
    providerPaymentId: result.providerPaymentId,
    providerOrderId: result.providerOrderId,
  });
  assert.equal(listing.track, "Restart Opener");
  assert.equal(store.getCheckoutIntent(local.intentId)?.lifecycle, "paid");
});

test("two store instances share listings, pending sessions, and click counters", () => {
  const first = temporaryStore();
  const second = createStore(first.path);
  first.store.rememberUnpaidCheckout({
    sessionId: "open-1",
    weekId: "2026-W34",
    track: "Pending",
    artist: "Bea",
    listenUrl: "https://example.com/pending?utm_medium=email",
    bidUsd: 6,
  });
  assert.equal(second.listUnpaid("2026-W34")[0]?.listenUrl, "https://example.com/pending");

  const listing = second.applyPaidEvent(paid({
    sessionId: "checkout-2",
    providerCheckoutId: "waffo-checkout-2",
    providerEventId: "waffo-event-2",
    track: "Shared",
    listenUrl: "https://example.com/shared",
  }));
  assert.equal(first.store.getListingById(listing.id)?.clicks, 0);
  first.store.incrementListingClicks(listing.id);
  assert.equal(second.getListingById(listing.id)?.clicks, 1);
  first.store.close();
  second.close();
});

test("duplicate provider checkout or delivery event is idempotent", () => {
  const { store } = temporaryStore();
  const created = store.applyPaidEvent(paid());
  assert.throws(
    () => store.applyPaidEvent(paid({ track: "Replay", providerEventId: "waffo-event-2" })),
    /event_reuse_mismatch/,
  );
  assert.throws(
    () => store.applyPaidEvent(
      paid({
        sessionId: "different-local-session",
        providerCheckoutId: "different-checkout",
        providerEventId: "waffo-event-1",
        track: "Delivery replay",
      }),
    ),
    /event_reuse_mismatch/,
  );
  assert.equal(store.getListingById(created.id)?.track, created.track);
  const paymentCount = store.db
    .prepare("SELECT COUNT(*) AS count FROM payments")
    .get() as { count: number };
  assert.equal(paymentCount.count, 1);
  const eventCount = store.db
    .prepare("SELECT COUNT(*) AS count FROM payment_events")
    .get() as { count: number };
  assert.equal(eventCount.count, 3);
  store.close();
});

test("checkout lifecycle is monotonic when settlement wins a checkout timing race", () => {
  const { store } = temporaryStore();
  const local = store.createCheckoutIntent({
    intentId: "timing-race-intent",
    listingDraft: {
      track: "Cold Open",
      artist: "Ada",
      listenUrl: "https://example.com/cold-open",
      weekId: "2026-W34",
    },
    kind: "create",
    currentBidCents: 0,
    targetBidCents: 500,
    chargeCents: 500,
    currency: "USD",
    productId: "fixture-product",
    mode: "fixture",
    createdAt: "2026-08-20T09:00:00.000Z",
  });
  store.attachCheckoutIntent({
    intentId: local.intentId,
    providerCheckoutId: "timing-race-checkout",
  });
  const listing = store.applyPaidEvent(paid({
    intentId: local.intentId,
    sessionId: local.intentId,
    providerCheckoutId: "timing-race-checkout",
    providerEventId: "timing-race-event",
    providerPaymentId: "timing-race-payment",
    providerOrderId: "timing-race-order",
  }));
  assert.equal(listing.bidUsd, 5);

  /* A delayed adapter/route error must not downgrade the committed paid row. */
  store.markIntentUnknown(local.intentId, "late_timeout");
  store.markIntentRejected(local.intentId, "late_route_error");
  store.attachCheckoutIntent({
    intentId: local.intentId,
    providerCheckoutId: "timing-race-checkout",
  });
  assert.equal(store.getCheckoutIntent(local.intentId)?.lifecycle, "paid");
  assert.equal(
    (store.db.prepare(
      "SELECT outcome FROM checkout_events WHERE intent_id = ? AND event_type = 'checkout.attached'",
    ).get(local.intentId) as { outcome: string }).outcome,
    "paid",
  );

  const rejected = store.createCheckoutIntent({
    intentId: "terminal-rejected-intent",
    listingDraft: {
      track: local.track,
      artist: local.artist,
      listenUrl: local.listenUrl,
      weekId: local.weekId,
    },
    kind: local.kind,
    currentBidCents: local.currentBidCents,
    targetBidCents: local.targetBidCents,
    chargeCents: local.chargeCents,
    currency: local.currency,
    productId: local.productId,
    mode: local.mode,
    taxCategory: local.taxCategory,
    claimantTokenHash: local.claimantTokenHash,
    metadata: local.metadata,
    createdAt: local.createdAt,
  });
  store.markIntentRejected(rejected.intentId, "provider_declined");
  assert.throws(
    () => store.applyPaidEvent(paid({
      intentId: rejected.intentId,
      sessionId: rejected.intentId,
      providerCheckoutId: "terminal-rejected-checkout",
      providerEventId: "terminal-rejected-event",
      providerPaymentId: "terminal-rejected-payment",
      providerOrderId: "terminal-rejected-order",
    })),
    /intent_rejected/,
  );
  assert.equal(store.getCheckoutIntent(rejected.intentId)?.lifecycle, "rejected");
  assert.deepEqual(
    store.db.prepare(
      "SELECT outcome, error_code FROM payment_events WHERE intent_id = ? ORDER BY id DESC LIMIT 1",
    ).get(rejected.intentId),
    { outcome: "rejected", error_code: "intent_rejected" },
  );
});

test("webhook keeps provider checkout correlation separate from webhook delivery id", async () => {
  const root = mkdtempSync(join(tmpdir(), "playlist-headline-webhook-"));
  tempRoots.push(root);
  const path = join(root, "board.sqlite");
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path;
  resetListings();
  resetPaymentPort();
  try {
    const started = await postCheckout(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          track: "Webhook Open",
          artist: "Ada",
          listenUrl: "https://example.com/webhook-open",
          amountUsd: "5",
        }),
      }),
    );
    const intentId = new URL(started.headers.get("location") ?? "", "http://localhost")
      .searchParams.get("intent");
    assert.ok(intentId);
    const sessionRow = getDb()
      .prepare("SELECT provider_checkout_id FROM checkout_intents WHERE intent_id = ?")
      .get(intentId) as { provider_checkout_id: string };
    const sessionId = sessionRow.provider_checkout_id;
    const rawBody = JSON.stringify({
      type: "order.completed",
      data: {
        checkoutId: sessionId,
        status: "succeeded",
        eventId: "event_webhook_1",
        paymentId: "payment_webhook_1",
        orderId: "order_webhook_1",
        timestamp: "2026-08-20T12:00:00.000Z",
      },
    });
    const first = await postWebhook(
      new Request("http://localhost/api/waffo/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": "delivery-1",
          "x-waffo-delivery-id": "delivery-1",
        },
        body: rawBody,
      }),
    );
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { received: true, applied: true });

    const row = getDb()
      .prepare(
        "SELECT provider_checkout_id FROM payments",
      )
      .get() as { provider_checkout_id: string };
    assert.deepEqual(row, {
      provider_checkout_id: sessionId,
    });
    const event = getDb()
      .prepare(
        "SELECT provider_checkout_id, provider_event_id FROM payment_events",
      )
      .get() as { provider_checkout_id: string; provider_event_id: string };
    assert.deepEqual(event, {
      provider_checkout_id: sessionId,
      provider_event_id: "event_webhook_1",
    });

    const replay = await postWebhook(
      new Request("http://localhost/api/waffo/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": "delivery-1",
          "x-waffo-delivery-id": "delivery-1",
        },
        body: rawBody,
      }),
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { received: true, applied: true });
    const count = getDb()
      .prepare("SELECT COUNT(*) AS count FROM payments")
      .get() as { count: number };
    assert.equal(count.count, 1);
  } finally {
    resetListings();
    resetPaymentPort();
    if (previousPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousPath;
    }
    resetListings();
  }
});

test("a difference raise updates the bid but preserves tie-created timestamp after restart", () => {
  const first = temporaryStore();
  const created = first.store.applyPaidEvent(paid({
    sessionId: "create-raise",
    providerCheckoutId: "waffo-create-raise",
    providerEventId: "event-create-raise",
    amountUsd: 5,
    paidAt: "2026-08-20T09:00:00.000Z",
  }));
  const raised = first.store.applyPaidEvent(paid({
    sessionId: "raise-1",
    providerCheckoutId: "waffo-raise-1",
    providerEventId: "event-raise-1",
    amountUsd: 7,
    kind: "raise",
    track: "Raised Open",
    paidAt: "2026-08-20T11:00:00.000Z",
  }));
  assert.equal(raised.id, created.id);
  assert.equal(raised.bidUsd, 12);
  assert.equal(raised.firstPaidAt, "2026-08-20T09:00:00.000Z");
  assert.equal(raised.lastPaidAt, "2026-08-20T11:00:00.000Z");
  first.store.close();

  const restarted = createStore(first.path);
  const loaded = restarted.getListingById(created.id);
  assert.equal(loaded?.bidUsd, 12);
  assert.equal(loaded?.firstPaidAt, "2026-08-20T09:00:00.000Z");
  assert.equal(loaded?.lastPaidAt, "2026-08-20T11:00:00.000Z");
  restarted.close();
});

test("a failed payment-ledger write rolls back the listing and unpaid intent", () => {
  const { store } = temporaryStore();
  const created = store.applyPaidEvent(paid({
    sessionId: "rollback-create",
    providerCheckoutId: "waffo-rollback-create",
    providerEventId: "event-rollback-create",
  }));
  store.rememberUnpaidCheckout({
    sessionId: "rollback-raise",
    weekId: "2026-W34",
    track: "Rollback Open",
    artist: "Ada",
    listenUrl: "https://example.com/cold-open",
    bidUsd: 7,
  });
  store.db.exec(`
    CREATE TRIGGER fail_payment_event_insert
    BEFORE INSERT ON payment_events
    BEGIN
      SELECT RAISE(ABORT, 'ledger_write_failed');
    END;
  `);
  assert.throws(
    () => store.applyPaidEvent(paid({
      sessionId: "rollback-raise",
      providerCheckoutId: "waffo-rollback-raise",
      providerEventId: "event-rollback-raise",
      amountUsd: 2,
      kind: "raise",
      paidAt: "2026-08-20T11:00:00.000Z",
    })),
    /ledger_write_failed/,
  );
  store.db.exec("DROP TRIGGER fail_payment_event_insert");
  assert.deepEqual(store.getListingById(created.id), created);
  assert.equal(store.listUnpaid("2026-W34")[0]?.sessionId, "rollback-raise");
  const paymentCount = store.db
    .prepare("SELECT COUNT(*) AS count FROM payments")
    .get() as { count: number };
  assert.equal(paymentCount.count, 1);
  store.close();
});
