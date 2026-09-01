import { createHash, randomUUID } from "node:crypto";
import { defaultDatabasePath, openDatabase, type AppDb } from "../db";
import { databasePath, type WaffoMode } from "../config";
import {
  canonicalListenUrl,
  listingListenKey,
  quoteBid,
  type CheckoutKind,
} from "./listing";
import { displayStringToCents, MIN_BID_USD, usdToCents } from "./money";
import type { Listing } from "./rank";
import { bidInRollingWeek, isoWeekMondayUtc, nowUtc } from "./week";

export type IntentLifecycle =
  | "creating"
  | "open"
  | "unknown"
  | "paid"
  | "abandoned"
  | "rejected"
  | "needs_reconciliation";

export type UnpaidTrack = {
  sessionId: string;
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  bidUsd: number;
};

export type CheckoutIntentInput = {
  intentId: string;
  listingDraft: {
    track: string;
    artist: string;
    listenUrl: string;
    weekId: string;
  };
  kind: CheckoutKind;
  currentBidCents: number;
  targetBidCents: number;
  chargeCents: number;
  currency: string;
  productId: string;
  mode: WaffoMode;
  taxCategory?: string;
  /** SHA-256 of the opaque browser claimant token; plaintext never enters the DB. */
  claimantTokenHash?: string;
  metadata?: Record<string, string>;
  createdAt?: string;
};

export type CheckoutIntent = {
  intentId: string;
  providerCheckoutId?: string;
  checkoutUrl?: string;
  expiresAt?: string;
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  kind: CheckoutKind;
  currentBidCents: number;
  targetBidCents: number;
  chargeCents: number;
  currency: string;
  productId: string;
  mode: WaffoMode;
  taxCategory: string;
  claimantTokenHash?: string;
  metadata: Record<string, string>;
  metadataFingerprint: string;
  intentFingerprint: string;
  lifecycle: IntentLifecycle;
  createdAt: string;
  updatedAt: string;
};

export type PaidBid = {
  /** Local intent ID. Legacy fixture callers may use sessionId instead. */
  sessionId: string;
  intentId?: string;
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  amountUsd: number;
  amountCents?: number;
  paidAt: string;
  kind?: CheckoutKind;
  productId?: string;
  currency?: string;
  metadata?: Record<string, string>;
  metadataFingerprint?: string;
  providerCheckoutId?: string;
  providerDeliveryId?: string;
  providerEventId?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  providerEventType?: string;
  rawBodyHash?: string;
  eventFingerprint?: string;
  /** Optional legacy-fixture ownership digest; provider intents carry it durably. */
  claimantTokenHash?: string;
};

export type ProviderEventObservation = {
  intentId?: string;
  providerDeliveryId?: string;
  providerEventId?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  providerCheckoutId?: string;
  providerEventType: string;
  rawBodyHash: string;
  eventFingerprint: string;
  payloadJson?: string;
  outcome: string;
  errorCode?: string;
  receivedAt?: string;
};

export type StoreOptions = {
  path?: string;
  databasePath?: string;
  db?: AppDb;
  env?: Record<string, string | undefined>;
};

export class StoreApplyError extends Error {
  constructor(
    message: string,
    readonly replayed = false,
  ) {
    super(message);
    this.name = "StoreApplyError";
  }
}

type ListingRow = {
  id: string;
  week_id: string;
  track: string;
  artist: string;
  listen_url: string;
  claimant_token_hash: string | null;
  bid_usd: number;
  first_paid_at: string;
  last_paid_at: string;
  clicks: number;
};

type IntentRow = {
  intent_id: string;
  provider_checkout_id: string | null;
  checkout_url: string | null;
  expires_at: string | null;
  week_id: string;
  track: string;
  artist: string;
  listen_key: string;
  listen_url: string;
  kind: CheckoutKind;
  current_bid_cents: number;
  target_bid_cents: number;
  charge_cents: number;
  currency: string;
  product_id: string;
  mode: WaffoMode;
  tax_category: string;
  claimant_token_hash: string | null;
  metadata_json: string;
  metadata_fingerprint: string;
  intent_fingerprint: string;
  lifecycle: IntentLifecycle;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: number;
  intent_id: string | null;
  provider_delivery_id: string | null;
  provider_event_id: string | null;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  provider_checkout_id: string | null;
  provider_event_type: string;
  event_type: string;
  payment_id: string | null;
  raw_body_hash: string;
  event_fingerprint: string;
  outcome: string;
  error_code: string | null;
  received_at: string;
  payload_json: string | null;
};

type PaymentRow = {
  id: string;
  intent_id: string;
  listing_id: string | null;
  session_id: string;
  provider_checkout_id: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  provider_event_id: string | null;
  provider_event_type: string | null;
  amount_usd: number;
  amount_cents: number;
  currency: string;
  kind: CheckoutKind;
  paid_at: string;
  created_at: string;
  outcome: string;
  error_code: string | null;
};

const LISTING_SELECT = `
  SELECT
    l.id,
    l.week_id,
    l.track,
    l.artist,
    l.listen_url,
    l.claimant_token_hash,
    l.bid_usd,
    l.first_paid_at,
    l.last_paid_at,
    COALESCE(c.count, 0) AS clicks
  FROM listings l
  LEFT JOIN clicks c ON c.listing_id = l.id
`;

const INTENT_SELECT = `
  SELECT intent_id, provider_checkout_id, checkout_url, expires_at,
         week_id, track, artist, listen_key, listen_url, kind,
         current_bid_cents, target_bid_cents, charge_cents, currency,
         product_id, mode, tax_category, claimant_token_hash, metadata_json,
         metadata_fingerprint, intent_fingerprint, lifecycle, created_at, updated_at
  FROM checkout_intents
`;

function hasPaidInstant(listing: Pick<Listing, "firstPaidAt">): boolean {
  return typeof listing.firstPaidAt === "string" &&
    listing.firstPaidAt.trim() !== "" &&
    Number.isFinite(Date.parse(listing.firstPaidAt));
}

function toListing(row: ListingRow): Listing {
  return {
    id: row.id,
    weekId: row.week_id,
    track: row.track,
    artist: row.artist,
    listenUrl: row.listen_url,
    bidUsd: row.bid_usd,
    firstPaidAt: row.first_paid_at,
    lastPaidAt: row.last_paid_at,
    clicks: row.clicks,
  };
}

function optionalId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function canonicalObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalObject(entry)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalObject(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function metadataFingerprint(metadata: Record<string, string>): string {
  return sha256(stableJson(metadata));
}

function intentCore(input: {
  weekId: string;
  track: string;
  artist: string;
  listenUrl: string;
  kind: CheckoutKind;
  currentBidCents: number;
  targetBidCents: number;
  chargeCents: number;
  currency: string;
  productId: string;
  mode: WaffoMode;
  taxCategory: string;
  claimantTokenHash?: string;
}): Record<string, unknown> {
  return {
    weekId: input.weekId,
    track: input.track,
    artist: input.artist,
    listenUrl: input.listenUrl,
    kind: input.kind,
    currentBidCents: input.currentBidCents,
    targetBidCents: input.targetBidCents,
    chargeCents: input.chargeCents,
    currency: input.currency,
    productId: input.productId,
    mode: input.mode,
    taxCategory: input.taxCategory,
    claimantTokenHash: input.claimantTokenHash ?? null,
  };
}

function metadataForIntent(
  input: CheckoutIntentInput,
  listenUrl: string,
  intentFingerprint: string,
): Record<string, string> {
  return {
    ...(input.metadata ?? {}),
    intentId: input.intentId,
    intentFingerprint,
    targetBidCents: String(input.targetBidCents),
    currentBidCents: String(input.currentBidCents),
    chargeCents: String(input.chargeCents),
    canonicalUrl: listenUrl,
    track: input.listingDraft.track,
    artist: input.listingDraft.artist,
    weekId: input.listingDraft.weekId,
    kind: input.kind,
    productId: input.productId,
    currency: input.currency,
    taxCategory: input.taxCategory ?? "digital_goods",
    ...(input.claimantTokenHash ? { claimantTokenHash: input.claimantTokenHash } : {}),
  };
}

function parseMetadata(json: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string") as Array<[string, string]>,
    );
  } catch {
    return {};
  }
}

function toIntent(row: IntentRow): CheckoutIntent {
  const metadata = parseMetadata(row.metadata_json);
  return {
    intentId: row.intent_id,
    providerCheckoutId: row.provider_checkout_id ?? undefined,
    checkoutUrl: row.checkout_url ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    weekId: row.week_id,
    track: row.track,
    artist: row.artist,
    listenUrl: row.listen_url,
    kind: row.kind,
    currentBidCents: row.current_bid_cents,
    targetBidCents: row.target_bid_cents,
    chargeCents: row.charge_cents,
    currency: row.currency,
    productId: row.product_id,
    mode: row.mode,
    taxCategory: row.tax_category,
    claimantTokenHash: row.claimant_token_hash ?? undefined,
    metadata,
    metadataFingerprint: row.metadata_fingerprint,
    intentFingerprint: row.intent_fingerprint,
    lifecycle: row.lifecycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function weekBounds(weekId: string, referenceAt: string): { startsAt: string; endsAt: string } {
  try {
    const starts = isoWeekMondayUtc(weekId);
    return {
      startsAt: starts.toISOString(),
      endsAt: new Date(starts.getTime() + 7 * 86_400_000).toISOString(),
    };
  } catch {
    const reference = new Date(referenceAt);
    const starts = Number.isNaN(reference.getTime()) ? new Date(0) : reference;
    return {
      startsAt: starts.toISOString(),
      endsAt: new Date(starts.getTime() + 7 * 86_400_000).toISOString(),
    };
  }
}

function normalizedPaidAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("paid timestamp is invalid");
  return parsed.toISOString();
}

function sameText(left: string | undefined, right: string | null | undefined): boolean {
  return left === (right ?? undefined);
}

function eventFingerprint(event: PaidBid, rawBodyHash: string): string {
  return sha256(stableJson({
    rawBodyHash,
    intentId: event.intentId,
    sessionId: event.sessionId,
    providerCheckoutId: event.providerCheckoutId,
    providerDeliveryId: event.providerDeliveryId,
    providerEventId: event.providerEventId,
    providerPaymentId: event.providerPaymentId,
    providerOrderId: event.providerOrderId,
    providerEventType: event.providerEventType,
    productId: event.productId,
    currency: event.currency,
    amountCents: event.amountCents ?? usdToCents(event.amountUsd),
    kind: event.kind,
    weekId: event.weekId,
    track: event.track,
    artist: event.artist,
    listenUrl: event.listenUrl,
    paidAt: event.paidAt,
    metadataFingerprint: event.metadataFingerprint,
    claimantTokenHash: event.claimantTokenHash,
  }));
}

function eventMatchesStored(
  row: EventRow,
  event: PaidBid,
  fingerprint: string,
  rawBodyHash: string,
): boolean {
  if (row.event_fingerprint !== fingerprint) return false;
  const sameDelivery = Boolean(event.providerDeliveryId) &&
    sameText(event.providerDeliveryId, row.provider_delivery_id);
  if (sameDelivery) return row.raw_body_hash === rawBodyHash;
  /* A provider may redeliver one business event with a fresh delivery row.
     The business/payment/order/checkout identity remains idempotent when its
     normalized fingerprint is exact, even though the raw delivery wrapper
     (and therefore raw body hash) differs. */
  return Boolean(
    (event.providerEventId && sameText(event.providerEventId, row.provider_event_id)) ||
    (event.providerPaymentId && sameText(event.providerPaymentId, row.provider_payment_id)) ||
    (event.providerOrderId && sameText(event.providerOrderId, row.provider_order_id)) ||
    (event.providerCheckoutId && sameText(event.providerCheckoutId, row.provider_checkout_id)) ||
    (event.intentId && sameText(event.intentId, row.intent_id)),
  );
}

function observationMatchesStored(
  row: EventRow,
  observation: ProviderEventObservation,
): boolean {
  if (row.event_fingerprint !== observation.eventFingerprint) return false;
  const deliveryId = optionalId(observation.providerDeliveryId);
  if (deliveryId && sameText(deliveryId, row.provider_delivery_id)) {
    return row.raw_body_hash === observation.rawBodyHash;
  }
  return Boolean(
    (observation.providerEventId && sameText(observation.providerEventId, row.provider_event_id)) ||
    (observation.providerPaymentId && sameText(observation.providerPaymentId, row.provider_payment_id)) ||
    (observation.providerOrderId && sameText(observation.providerOrderId, row.provider_order_id)) ||
    (observation.providerCheckoutId && sameText(observation.providerCheckoutId, row.provider_checkout_id)) ||
    (observation.intentId && sameText(observation.intentId, row.intent_id)),
  );
}

function lifecyclePredecessors(next: IntentLifecycle): IntentLifecycle[] {
  switch (next) {
    case "creating":
      return ["creating"];
    case "open":
      return ["creating", "open", "unknown"];
    case "unknown":
      return ["creating", "open", "unknown"];
    case "paid":
      return ["creating", "open", "unknown", "paid"];
    case "abandoned":
      return ["creating", "open", "unknown", "abandoned"];
    case "rejected":
      return ["creating", "open", "unknown", "rejected"];
    case "needs_reconciliation":
      return ["creating", "open", "unknown", "needs_reconciliation"];
  }
}

/**
 * SQLite-backed source of truth for the paid board and payment intent ledger.
 * Every provider settlement and listing mutation is inside one IMMEDIATE
 * transaction, so a captured stale raise can be reconciled without changing
 * the current rank.
 */
export class Store {
  readonly db: AppDb;
  readonly databasePath: string;
  private readonly ownsDatabase: boolean;
  private closed = false;

  constructor(options: StoreOptions | string | AppDb = {}) {
    const normalized: StoreOptions = typeof options === "string"
      ? { databasePath: options }
      : isAppDb(options)
        ? { db: options }
        : options;
    this.databasePath = normalized.databasePath ?? normalized.path ??
      (normalized.env ? databasePath(normalized.env) : defaultDatabasePath());
    if (normalized.db) {
      this.db = normalized.db;
      this.ownsDatabase = false;
    } else {
      this.db = openDatabase(this.databasePath);
      this.ownsDatabase = true;
    }
  }

  close(): void {
    if (this.closed || !this.ownsDatabase) return;
    this.db.close();
    this.closed = true;
  }

  reset(): void {
    this.db.exec(`
      DELETE FROM payment_events;
      DELETE FROM checkout_events;
      DELETE FROM payments;
      DELETE FROM clicks;
      DELETE FROM unpaid_checkouts;
      DELETE FROM checkout_intents;
      DELETE FROM listings;
      DELETE FROM weeks;
    `);
  }

  listPaidInRollingWeek(now: Date = nowUtc()): Listing[] {
    return this.listings().filter((listing) =>
      hasPaidInstant(listing) && bidInRollingWeek(listing.firstPaidAt, now));
  }

  listPaidForWeek(weekId: string): Listing[] {
    return this.listings(`${LISTING_SELECT} WHERE l.week_id = ?`, weekId)
      .filter(hasPaidInstant);
  }

  listUnpaid(weekId: string): UnpaidTrack[] {
    const rows = this.db.prepare(
      `${INTENT_SELECT}
       WHERE week_id = ? AND lifecycle IN ('creating', 'open', 'unknown')
       ORDER BY created_at ASC, intent_id ASC`,
    ).all(weekId) as IntentRow[];
    return rows.map((row) => ({
      sessionId: row.provider_checkout_id ?? row.intent_id,
      weekId: row.week_id,
      track: row.track,
      artist: row.artist,
      listenUrl: row.listen_url,
      bidUsd: Math.floor(row.target_bid_cents / 100),
    }));
  }

  getCheckoutIntent(intentId: string): CheckoutIntent | undefined {
    const row = this.db.prepare(`${INTENT_SELECT} WHERE intent_id = ?`).get(intentId) as
      | IntentRow
      | undefined;
    return row ? toIntent(row) : undefined;
  }

  getIntent(intentId: string): CheckoutIntent | undefined {
    return this.getCheckoutIntent(intentId);
  }

  findCheckoutIntentByProviderCheckoutId(providerCheckoutId: string): CheckoutIntent | undefined {
    const row = this.db.prepare(
      `${INTENT_SELECT} WHERE provider_checkout_id = ?`,
    ).get(providerCheckoutId) as IntentRow | undefined;
    return row ? toIntent(row) : undefined;
  }

  createCheckoutIntent(input: CheckoutIntentInput): CheckoutIntent {
    const listenUrl = canonicalListenUrl(input.listingDraft.listenUrl);
    const currency = input.currency.trim().toUpperCase();
    const taxCategory = input.taxCategory?.trim() || "digital_goods";
    if (!input.intentId.trim()) throw new Error("intent_id_required");
    if (!input.listingDraft.weekId.trim() || !input.listingDraft.track.trim() || !input.listingDraft.artist.trim()) {
      throw new Error("invalid_listing");
    }
    if (input.kind !== "create" && input.kind !== "raise") {
      throw new Error("invalid_checkout_kind");
    }
    if (currency !== "USD") throw new Error("currency_mismatch");
    if (!input.productId.trim()) throw new Error("product_required");
    if (input.mode !== "fixture" && input.mode !== "waffo-test" && input.mode !== "waffo-prod") {
      throw new Error("invalid_payment_mode");
    }
    if (taxCategory !== "digital_goods") throw new Error("tax_category_mismatch");
    if (!Number.isSafeInteger(input.currentBidCents) || input.currentBidCents < 0) {
      throw new Error("invalid_current_bid");
    }
    if (!Number.isSafeInteger(input.targetBidCents) || input.targetBidCents < 100) {
      throw new Error("invalid_target_bid");
    }
    if (!Number.isSafeInteger(input.chargeCents) || input.chargeCents < 100) {
      throw new Error("invalid_charge");
    }
    if (input.currentBidCents % 100 !== 0 || input.targetBidCents % 100 !== 0 || input.chargeCents % 100 !== 0) {
      throw new Error("amount_mismatch");
    }
    if (input.kind === "raise" && input.currentBidCents + input.chargeCents !== input.targetBidCents) {
      throw new Error("intent_quote_mismatch");
    }
    if (input.kind === "create" && input.currentBidCents !== 0) {
      throw new Error("intent_quote_mismatch");
    }
    const core = intentCore({
      weekId: input.listingDraft.weekId,
      track: input.listingDraft.track,
      artist: input.listingDraft.artist,
      listenUrl,
      kind: input.kind,
      currentBidCents: input.currentBidCents,
      targetBidCents: input.targetBidCents,
      chargeCents: input.chargeCents,
      currency,
      productId: input.productId,
      mode: input.mode,
      taxCategory,
      claimantTokenHash: input.claimantTokenHash,
    });
    const intentFingerprint = sha256(stableJson(core));
    const metadata = metadataForIntent(input, listenUrl, intentFingerprint);
    const metadataFp = metadataFingerprint(metadata);
    const createdAt = input.createdAt ? normalizedPaidAt(input.createdAt) : nowUtc().toISOString();

    const create = this.db.transaction(() => {
      const existing = this.getCheckoutIntent(input.intentId);
      if (existing) {
        if (existing.intentFingerprint !== intentFingerprint ||
            existing.metadataFingerprint !== metadataFp ||
            existing.listenUrl !== listenUrl ||
            existing.targetBidCents !== input.targetBidCents ||
            existing.chargeCents !== input.chargeCents ||
            existing.claimantTokenHash !== input.claimantTokenHash) {
          throw new Error("intent_mismatch");
        }
        return existing;
      }
      this.ensureWeek(input.listingDraft.weekId, createdAt);
      this.db.prepare(
        `INSERT INTO checkout_intents (
           intent_id, provider_checkout_id, checkout_url, expires_at,
           week_id, track, artist, listen_key, listen_url, kind,
           current_bid_cents, target_bid_cents, charge_cents, currency,
           product_id, mode, tax_category, claimant_token_hash, metadata_json, metadata_fingerprint,
           intent_fingerprint, lifecycle, created_at, updated_at
         ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)`,
      ).run(
        input.intentId,
        input.listingDraft.weekId,
        input.listingDraft.track,
        input.listingDraft.artist,
        listingListenKey(listenUrl),
        listenUrl,
        input.kind,
        input.currentBidCents,
        input.targetBidCents,
        input.chargeCents,
        currency,
        input.productId,
        input.mode,
        taxCategory,
        input.claimantTokenHash ?? null,
        stableJson(metadata),
        metadataFp,
        intentFingerprint,
        createdAt,
        createdAt,
      );
      this.recordCheckoutEvent({
        intentId: input.intentId,
        eventType: "intent.created",
        outcome: "creating",
        createdAt,
      });
      return this.getCheckoutIntent(input.intentId) as CheckoutIntent;
    }).immediate;
    return create();
  }

  createIntent(input: CheckoutIntentInput): CheckoutIntent {
    return this.createCheckoutIntent(input);
  }

  attachCheckoutIntent(input: {
    intentId: string;
    providerCheckoutId: string;
    checkoutUrl?: string;
    expiresAt?: string;
  }): CheckoutIntent {
    const providerCheckoutId = input.providerCheckoutId.trim();
    if (!providerCheckoutId) throw new Error("provider_checkout_id_required");
    const attach = this.db.transaction(() => {
      const intent = this.getCheckoutIntent(input.intentId);
      if (!intent) throw new Error("unknown_intent");
      const collision = this.findCheckoutIntentByProviderCheckoutId(providerCheckoutId);
      if (collision && collision.intentId !== intent.intentId) {
        throw new Error("provider_checkout_reuse");
      }
      if (intent.providerCheckoutId && intent.providerCheckoutId !== providerCheckoutId) {
        throw new Error("intent_mismatch");
      }
      if (intent.providerCheckoutId === providerCheckoutId) {
        if ((input.checkoutUrl && intent.checkoutUrl && input.checkoutUrl !== intent.checkoutUrl) ||
            (input.expiresAt && intent.expiresAt && input.expiresAt !== intent.expiresAt)) {
          throw new Error("checkout_response_mismatch");
        }
        return intent;
      }
      const updatedAt = nowUtc().toISOString();
      const update = this.db.prepare(
        `UPDATE checkout_intents
         SET provider_checkout_id = ?, checkout_url = ?, expires_at = ?,
             lifecycle = CASE WHEN lifecycle = 'creating' OR lifecycle = 'unknown'
                              THEN 'open' ELSE lifecycle END,
             updated_at = ?
         WHERE intent_id = ? AND provider_checkout_id IS NULL`,
      ).run(
        providerCheckoutId,
        input.checkoutUrl ?? null,
        input.expiresAt ?? null,
        updatedAt,
        input.intentId,
      );
      const committed = this.getCheckoutIntent(input.intentId);
      if (!committed) throw new Error("unknown_intent");
      if (committed.providerCheckoutId !== providerCheckoutId) {
        throw new Error("provider_checkout_reuse");
      }
      /* The CAS above may find a terminal intent (for example, a webhook won
         the race). Record the outcome that actually committed, never the
         optimistic `open` state from the response path. */
      if (update.changes > 0) {
        this.recordCheckoutEvent({
          intentId: committed.intentId,
          providerCheckoutId,
          eventType: "checkout.attached",
          outcome: committed.lifecycle,
          createdAt: updatedAt,
        });
      }
      return committed;
    }).immediate;
    return attach();
  }

  attachProviderCheckout(
    intentId: string,
    providerCheckoutId: string,
    checkoutUrl?: string,
    expiresAt?: string,
  ): CheckoutIntent {
    return this.attachCheckoutIntent({ intentId, providerCheckoutId, checkoutUrl, expiresAt });
  }

  markCheckoutIntent(
    intentId: string,
    lifecycle: IntentLifecycle,
    errorCode?: string,
  ): CheckoutIntent | undefined {
    const mark = this.db.transaction(() => {
      const committed = this.transitionIntent(intentId, lifecycle);
      if (errorCode && committed?.lifecycle === lifecycle) {
        this.db.prepare(
          `UPDATE checkout_events SET error_code = ?
           WHERE id = (SELECT id FROM checkout_events WHERE intent_id = ? ORDER BY id DESC LIMIT 1)`,
        ).run(errorCode, intentId);
      }
      return committed;
    }).immediate;
    return mark();
  }

  markIntentUnknown(intentId: string, errorCode?: string): void {
    this.markCheckoutIntent(intentId, "unknown", errorCode);
  }

  markIntentRejected(intentId: string, errorCode?: string): void {
    this.markCheckoutIntent(intentId, "rejected", errorCode);
  }

  markIntentNeedsReconciliation(intentId: string, errorCode?: string): void {
    this.markCheckoutIntent(intentId, "needs_reconciliation", errorCode);
  }

  abandonCheckoutIntent(intentId: string): void {
    const intent = this.getCheckoutIntent(intentId);
    if (!intent) return;
    this.markCheckoutIntent(intentId, "abandoned");
    this.db.prepare(
      `DELETE FROM unpaid_checkouts WHERE session_id = ? OR provider_checkout_id = ?`,
    ).run(intentId, intent.providerCheckoutId ?? intentId);
  }

  rememberUnpaidCheckout(input: UnpaidTrack): void {
    const existing = this.getCheckoutIntent(input.sessionId);
    if (existing) {
      if (existing.listenUrl !== canonicalListenUrl(input.listenUrl) ||
          existing.targetBidCents !== usdToCents(input.bidUsd)) {
        throw new Error("intent_mismatch");
      }
      return;
    }
    this.createCheckoutIntent({
      intentId: input.sessionId,
      listingDraft: input,
      kind: "create",
      currentBidCents: 0,
      targetBidCents: usdToCents(input.bidUsd),
      chargeCents: usdToCents(input.bidUsd),
      currency: "USD",
      productId: "fixture-product",
      mode: "fixture",
    });
  }

  /** Compatibility name. It marks a durable intent; it does not erase it. */
  forgetUnpaidCheckout(sessionId: string, providerCheckoutId = sessionId): void {
    const intent = this.getCheckoutIntent(sessionId) ??
      this.findCheckoutIntentByProviderCheckoutId(providerCheckoutId);
    if (intent) this.abandonCheckoutIntent(intent.intentId);
  }

  getListingById(id: string): Listing | undefined {
    const row = this.db.prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(id) as
      | ListingRow
      | undefined;
    if (!row) return undefined;
    const listing = toListing(row);
    return hasPaidInstant(listing) ? listing : undefined;
  }

  incrementListingClicks(id: string): Listing | undefined {
    const increment = this.db.transaction(() => {
      if (!this.getListingById(id)) return undefined;
      this.db.prepare(
        `INSERT INTO clicks (listing_id, count) VALUES (?, 1)
         ON CONFLICT(listing_id) DO UPDATE SET count = clicks.count + 1`,
      ).run(id);
      return this.getListingById(id);
    }).immediate;
    return increment();
  }

  /** Raise identity is `findPaidByListenUrl`; weekId is only an audit label. */
  findPaidByListenUrl(listenUrl: string, now: Date = nowUtc()): Listing | undefined {
    const key = listingListenKey(listenUrl);
    return this.listPaidInRollingWeek(now).find((listing) => listingListenKey(listing.listenUrl) === key);
  }

  /** Claimant ownership is checked by digest; the opaque token is never exposed. */
  isListingClaimant(listingId: string, claimantHash: string | undefined): boolean {
    const stored = this.listingClaimantHash(listingId);
    return Boolean(stored && claimantHash && stored === claimantHash);
  }

  /** Internal compatibility inspection; returns only a one-way digest. */
  claimantHashForListing(listingId: string): string | null | undefined {
    return this.listingClaimantHash(listingId);
  }

  listingForSession(sessionId: string): Listing | undefined {
    const row = this.db.prepare(
      `SELECT listing_id FROM payments
       WHERE intent_id = ? OR session_id = ? OR provider_checkout_id = ?
          OR provider_order_id = ? OR provider_payment_id = ?
       ORDER BY created_at ASC LIMIT 1`,
    ).get(sessionId, sessionId, sessionId, sessionId, sessionId) as
      | { listing_id: string | null }
      | undefined;
    return row?.listing_id ? this.getListingById(row.listing_id) : undefined;
  }

  /** Record a verified observation even when its business facts cannot settle. */
  recordProviderEvent(observation: ProviderEventObservation): "duplicate" | "inserted" {
    const receivedAt = observation.receivedAt ?? nowUtc().toISOString();
    const record = this.db.transaction((): "mismatch" | "duplicate" | "inserted" => {
      const existing = this.findEvent(observation);
      if (existing) {
        if (!observationMatchesStored(existing, observation)) {
          this.insertReplayMismatchEvent({
            intentId: observation.intentId,
            providerEventType: observation.providerEventType,
            fingerprint: observation.eventFingerprint,
            rawBodyHash: observation.rawBodyHash,
            receivedAt,
            errorCode: "event_reuse_mismatch",
          });
          return "mismatch";
        }
        return "duplicate";
      }
      const knownIntentId = observation.intentId && this.getCheckoutIntent(observation.intentId)
        ? observation.intentId
        : null;
      this.db.prepare(
        `INSERT INTO payment_events (
           intent_id, provider_delivery_id, provider_event_id,
           provider_payment_id, provider_order_id, provider_checkout_id,
           provider_event_type, event_type, payment_id, raw_body_hash,
           event_fingerprint, outcome, error_code, received_at, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      ).run(
        knownIntentId,
        observation.providerDeliveryId ?? null,
        observation.providerEventId ?? null,
        observation.providerPaymentId ?? null,
        observation.providerOrderId ?? null,
        observation.providerCheckoutId ?? null,
        observation.providerEventType,
        observation.providerEventType,
        observation.rawBodyHash,
        observation.eventFingerprint,
        observation.outcome,
        observation.errorCode ?? null,
        receivedAt,
        observation.payloadJson ?? null,
      );
      return "inserted";
    }).immediate;
    const outcome = record();
    if (outcome === "mismatch") throw new StoreApplyError("event_reuse_mismatch");
    return outcome;
  }

  /**
   * Apply only facts that were verified by a provider adapter. Legacy fixture
   * callers without a provider event type receive a local immutable intent so
   * the existing pure rank tests remain useful; real provider events require
   * an explicit intent ID and never infer listing data from the webhook.
   */
  applyPaidEvent(event: PaidBid): Listing {
    if (!Number.isInteger(event.amountUsd) || event.amountUsd < 1) {
      throw new Error("bid must be a whole dollar");
    }
    const amountCents = event.amountCents ?? usdToCents(event.amountUsd);
    if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents !== usdToCents(event.amountUsd)) {
      throw new Error("amount_mismatch");
    }
    const providerCheckoutId = optionalId(event.providerCheckoutId);
    const providerDeliveryId = optionalId(event.providerDeliveryId);
    const providerEventId = optionalId(event.providerEventId);
    const providerPaymentId = optionalId(event.providerPaymentId);
    const providerOrderId = optionalId(event.providerOrderId);
    const providerEventType = optionalId(event.providerEventType);
    const rawBodyHash = event.rawBodyHash ?? sha256(stableJson(event));
    const fingerprint = event.eventFingerprint ?? eventFingerprint(event, rawBodyHash);
    const localIntentId = optionalId(event.intentId) ??
      (providerEventType
        ? undefined
        : this.findCheckoutIntentByProviderCheckoutId(event.sessionId)?.intentId ?? event.sessionId);
    if (localIntentId && !providerEventType && !this.getCheckoutIntent(localIntentId)) {
      /* A legacy caller may change the local session while replaying a known
         provider identity. Inspect that identity before synthesizing a new
         intent; otherwise an existing listing could turn the replay into a
         misleading quote error (or rewrite an unrelated unpaid intent). */
      const prior = this.findEvent({
        providerDeliveryId,
        providerEventId,
        providerPaymentId,
        providerOrderId,
        providerCheckoutId,
        intentId: localIntentId,
      });
      if (prior) {
        const replay = this.db.transaction(() => {
          if (!eventMatchesStored(prior, event, fingerprint, rawBodyHash)) {
            this.insertReplayMismatchEvent({
              intentId: localIntentId,
              providerEventType,
              fingerprint,
              rawBodyHash,
              receivedAt: nowUtc().toISOString(),
              errorCode: "event_reuse_mismatch",
            });
            return { error: "event_reuse_mismatch" as const };
          }
          if (prior.outcome === "needs_reconciliation" || prior.outcome === "rejected") {
            return { error: prior.error_code ?? "reconciliation_required", replayed: true };
          }
          const priorPayment = prior.payment_id ? this.paymentById(prior.payment_id) : undefined;
          return priorPayment?.listing_id
            ? { listing: this.listingForPayment(priorPayment) }
            : { error: "payment_incomplete" as const };
        }).immediate();
        if (replay.error) throw new StoreApplyError(replay.error, replay.replayed);
        if (replay.listing) return replay.listing;
        throw new Error("payment_incomplete");
      }
      this.createLegacyIntent(event, localIntentId, amountCents);
    }
    const apply = this.db.transaction((): { listing?: Listing; error?: string; replayed?: boolean } => {
      const replay = this.findEvent({
        providerDeliveryId,
        providerEventId,
        providerPaymentId,
        providerOrderId,
        providerCheckoutId,
        intentId: localIntentId,
      });
      if (replay) {
        if (!eventMatchesStored(replay, event, fingerprint, rawBodyHash)) {
          this.insertReplayMismatchEvent({
            intentId: localIntentId,
            providerEventType,
            fingerprint,
            rawBodyHash,
            receivedAt: nowUtc().toISOString(),
            errorCode: "event_reuse_mismatch",
          });
          return { error: "event_reuse_mismatch" };
        }
        if (replay.outcome === "needs_reconciliation" || replay.outcome === "rejected") {
            return { error: replay.error_code ?? "reconciliation_required", replayed: true };
        }
        const replayPayment = replay.payment_id ? this.paymentById(replay.payment_id) : undefined;
        if (replayPayment?.listing_id) return { listing: this.listingForPayment(replayPayment) };
        return { error: "payment_incomplete" };
      }

      if (!localIntentId) {
        return { error: "unknown_intent" };
      }
      let intent = this.getCheckoutIntent(localIntentId);
      if (!intent) return { error: "unknown_intent" };
      const existingListing = this.findPaidByListenUrl(intent.listenUrl);

      /* Terminal intent state is monotonic. A new signed delivery may be
         audited, but it cannot reopen a rejected/abandoned intent or create a
         second settlement after paid/reconciliation. Exact retries were
         handled by the identity lookup above. */
      if (intent.lifecycle === "paid") {
        this.insertRejectedEvent(event, fingerprint, rawBodyHash, localIntentId, "payment_already_settled");
        return { error: "payment_already_settled" };
      }
      if (intent.lifecycle === "needs_reconciliation") {
        this.insertRejectedEvent(event, fingerprint, rawBodyHash, localIntentId, "reconciliation_required");
        return { error: "reconciliation_required" };
      }
      if (intent.lifecycle === "rejected") {
        this.insertRejectedEvent(event, fingerprint, rawBodyHash, localIntentId, "intent_rejected");
        return { error: "intent_rejected" };
      }
      if (intent.lifecycle === "abandoned") {
        this.insertRejectedEvent(event, fingerprint, rawBodyHash, localIntentId, "intent_abandoned");
        return { error: "intent_abandoned" };
      }

      const factError = this.validateEventAgainstIntent(event, intent, amountCents, providerCheckoutId);
      if (factError) {
        this.insertRejectedEvent(event, fingerprint, rawBodyHash, localIntentId, factError);
        return { error: factError };
      }

      const existingPayment = this.paymentForAnyIdentity(
        localIntentId,
        providerCheckoutId,
        providerOrderId,
        providerPaymentId,
      );
      if (existingPayment) {
        if (!this.paymentFactsMatch(existingPayment, event, intent, amountCents)) {
          this.insertRejectedEvent(event, fingerprint, rawBodyHash, localIntentId, "payment_identity_reuse");
          return { error: "payment_identity_reuse" };
        }
        if (existingPayment.listing_id) return { listing: this.listingForPayment(existingPayment) };
        return { error: existingPayment.error_code ?? "reconciliation_required" };
      }

      /* A timeout can lose the provider response after Waffo accepted the
         request. The signed event is the only safe source allowed to attach
         that checkout ID, and a collision is never silently reassigned. */
      if (providerCheckoutId && !intent.providerCheckoutId) {
        const checkoutCollision = this.findCheckoutIntentByProviderCheckoutId(providerCheckoutId);
        if (checkoutCollision && checkoutCollision.intentId !== intent.intentId) {
          this.insertRejectedEvent(event, fingerprint, rawBodyHash, localIntentId, "checkout_identity_reuse");
          return { error: "checkout_identity_reuse" };
        }
        this.db.prepare(
          `UPDATE checkout_intents SET provider_checkout_id = ?, lifecycle = CASE
             WHEN lifecycle IN ('creating', 'unknown') THEN 'open' ELSE lifecycle END,
             updated_at = ? WHERE intent_id = ? AND provider_checkout_id IS NULL`,
        ).run(providerCheckoutId, nowUtc().toISOString(), intent.intentId);
        intent = this.getCheckoutIntent(intent.intentId) as CheckoutIntent;
      }

      const existing = existingListing;
      const normalizedPaid = normalizedPaidAt(event.paidAt);
      const now = nowUtc().toISOString();
      const paidMs = Date.parse(normalizedPaid);
      const intentCreatedMs = Date.parse(intent.createdAt);
      const receiptMs = Date.parse(now);
      const timestampError = paidMs < intentCreatedMs
        ? "captured_timestamp_before_intent"
        : paidMs > receiptMs
          ? "captured_timestamp_after_receipt"
          : !bidInRollingWeek(normalizedPaid, new Date(receiptMs))
            ? "captured_timestamp_out_of_window"
            : undefined;
      if (timestampError) {
        const paymentId = this.insertPayment({
          event,
          intent,
          listingId: null,
          amountCents,
          outcome: "needs_reconciliation",
          errorCode: timestampError,
          createdAt: now,
        });
        this.insertPaymentEvent({
          event,
          intent,
          paymentId,
          fingerprint,
          rawBodyHash,
          outcome: "needs_reconciliation",
          errorCode: timestampError,
          receivedAt: now,
        });
        this.transitionIntent(intent.intentId, "needs_reconciliation");
        return { error: "reconciliation_required" };
      }
      if (intent.kind === "create") {
        if (existing) {
          const paymentId = this.insertPayment({
            event,
            intent,
            listingId: null,
            amountCents,
            outcome: "needs_reconciliation",
            errorCode: "identity_taken",
            createdAt: now,
          });
          this.insertPaymentEvent({ event, intent, paymentId, fingerprint, rawBodyHash, outcome: "needs_reconciliation", errorCode: "identity_taken", receivedAt: now });
          this.transitionIntent(intent.intentId, "needs_reconciliation");
          return { error: "reconciliation_required" };
        }
        const listing: Listing = {
          id: `lst_${randomUUID()}`,
          weekId: intent.weekId,
          track: intent.track,
          artist: intent.artist,
          listenUrl: intent.listenUrl,
          bidUsd: intent.targetBidCents / 100,
          firstPaidAt: normalizedPaid,
          lastPaidAt: normalizedPaid,
          clicks: 0,
        };
        this.ensureWeek(intent.weekId, normalizedPaid);
        this.db.prepare(
           `INSERT INTO listings (
             id, week_id, listen_key, track, artist, listen_url, claimant_token_hash,
             bid_usd, first_paid_at, last_paid_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          listing.id,
          listing.weekId,
          listingListenKey(listing.listenUrl),
          listing.track,
          listing.artist,
          listing.listenUrl,
          intent.claimantTokenHash ?? null,
          listing.bidUsd,
          listing.firstPaidAt,
          listing.lastPaidAt,
        );
        const paymentId = this.insertPayment({ event, intent, listingId: listing.id, amountCents, outcome: "applied", createdAt: now });
        this.insertPaymentEvent({ event, intent, paymentId, fingerprint, rawBodyHash, outcome: "applied", receivedAt: now });
        this.transitionIntent(intent.intentId, "paid");
        this.deleteUnpaidProjection(intent);
        return { listing };
      }

      if (!existing || existing.bidUsd * 100 !== intent.currentBidCents) {
        const errorCode = !existing ? "raise_target_missing" : "stale_raise";
        const paymentId = this.insertPayment({ event, intent, listingId: null, amountCents, outcome: "needs_reconciliation", errorCode, createdAt: now });
        this.insertPaymentEvent({ event, intent, paymentId, fingerprint, rawBodyHash, outcome: "needs_reconciliation", errorCode, receivedAt: now });
        this.transitionIntent(intent.intentId, "needs_reconciliation");
        return { error: "reconciliation_required" };
      }
      const incumbentClaimant = this.listingClaimantHash(existing.id);
      const legacyFixtureApply = providerEventType === undefined &&
        incumbentClaimant === null && !intent.claimantTokenHash;
      if (!legacyFixtureApply &&
          (!incumbentClaimant || incumbentClaimant !== intent.claimantTokenHash)) {
        const paymentId = this.insertPayment({
          event,
          intent,
          listingId: null,
          amountCents,
          outcome: "needs_reconciliation",
          errorCode: "not_owner",
          createdAt: now,
        });
        this.insertPaymentEvent({ event, intent, paymentId, fingerprint, rawBodyHash, outcome: "needs_reconciliation", errorCode: "not_owner", receivedAt: now });
        this.transitionIntent(intent.intentId, "needs_reconciliation");
        return { error: "not_owner" };
      }
      if (
        intent.claimantTokenHash &&
        (existing.track !== intent.track || existing.artist !== intent.artist ||
          listingListenKey(existing.listenUrl) !== listingListenKey(intent.listenUrl))
      ) {
        const paymentId = this.insertPayment({
          event,
          intent,
          listingId: null,
          amountCents,
          outcome: "needs_reconciliation",
          errorCode: "identity_facts_mismatch",
          createdAt: now,
        });
        this.insertPaymentEvent({ event, intent, paymentId, fingerprint, rawBodyHash, outcome: "needs_reconciliation", errorCode: "identity_facts_mismatch", receivedAt: now });
        this.transitionIntent(intent.intentId, "needs_reconciliation");
        return { error: "identity_facts_mismatch" };
      }
      const targetBidUsd = intent.targetBidCents / 100;
      quoteBid(existing, targetBidUsd);
      this.db.prepare(
        `UPDATE listings SET bid_usd = ?, last_paid_at = ? WHERE id = ?`,
      ).run(targetBidUsd, normalizedPaid, existing.id);
      const paymentId = this.insertPayment({ event, intent, listingId: existing.id, amountCents, outcome: "applied", createdAt: now });
      this.insertPaymentEvent({ event, intent, paymentId, fingerprint, rawBodyHash, outcome: "applied", receivedAt: now });
      this.transitionIntent(intent.intentId, "paid");
      this.deleteUnpaidProjection(intent);
      return { listing: this.getListingById(existing.id) as Listing };
    }).immediate;
    const result = apply();
    if (result.error) throw new StoreApplyError(result.error, result.replayed);
    if (!result.listing) throw new Error("payment_incomplete");
    return result.listing;
  }

  private createLegacyIntent(event: PaidBid, intentId: string, amountCents: number): CheckoutIntent {
    const existing = this.findPaidByListenUrl(event.listenUrl);
    const kind = event.kind ?? (existing ? "raise" : "create");
    const currentBidCents = existing ? existing.bidUsd * 100 : 0;
    const targetBidCents = kind === "raise" ? currentBidCents + amountCents : amountCents;
    return this.createCheckoutIntent({
      intentId,
      listingDraft: {
        track: event.track,
        artist: event.artist,
        listenUrl: event.listenUrl,
        weekId: event.weekId,
      },
      kind,
      currentBidCents,
      targetBidCents,
      chargeCents: amountCents,
      currency: "USD",
      productId: event.productId ?? "fixture-product",
      mode: "fixture",
      claimantTokenHash: event.claimantTokenHash,
      createdAt: event.paidAt,
    });
  }

  private validateEventAgainstIntent(
    event: PaidBid,
    intent: CheckoutIntent,
    amountCents: number,
    providerCheckoutId: string | undefined,
  ): string | undefined {
    if (providerCheckoutId && intent.providerCheckoutId && providerCheckoutId !== intent.providerCheckoutId) return "checkout_mismatch";
    if (event.productId && event.productId !== intent.productId) return "product_mismatch";
    if (event.currency && event.currency.toUpperCase() !== intent.currency.toUpperCase()) return "currency_mismatch";
    if (amountCents !== intent.chargeCents) return "amount_mismatch";
    if (event.metadataFingerprint && event.metadataFingerprint !== intent.metadataFingerprint) return "metadata_mismatch";
    let canonical: string;
    try {
      canonical = canonicalListenUrl(event.listenUrl);
    } catch {
      return "intent_mismatch";
    }
    if (canonical !== intent.listenUrl || event.track !== intent.track || event.artist !== intent.artist || event.weekId !== intent.weekId) return "intent_mismatch";
    if (event.kind && event.kind !== intent.kind) return "kind_mismatch";
    return undefined;
  }

  private paymentFactsMatch(payment: PaymentRow, event: PaidBid, intent: CheckoutIntent, amountCents: number): boolean {
    return payment.intent_id === intent.intentId &&
      payment.amount_cents === amountCents &&
      payment.kind === intent.kind &&
      payment.currency.toUpperCase() === intent.currency.toUpperCase() &&
      sameText(event.providerCheckoutId, payment.provider_checkout_id) &&
      sameText(event.providerOrderId, payment.provider_order_id) &&
      sameText(event.providerPaymentId, payment.provider_payment_id);
  }

  private insertRejectedEvent(event: PaidBid, fingerprint: string, rawBodyHash: string, intentId: string | undefined, errorCode: string): void {
    this.insertPaymentEvent({
      event,
      intent: intentId ? this.getCheckoutIntent(intentId) : undefined,
      paymentId: undefined,
      fingerprint,
      rawBodyHash,
      outcome: "rejected",
      errorCode,
      receivedAt: nowUtc().toISOString(),
    });
  }

  /**
   * Keep the original accepted/rejected identity row immutable. A changed
   * payload reusing a unique provider identifier gets an anonymous audit row
   * so the attempted reuse is durable without turning an earlier settlement
   * into a rejection or violating the unique provider indexes.
   */
  private insertReplayMismatchEvent(input: {
    intentId?: string;
    providerEventType?: string;
    fingerprint: string;
    rawBodyHash: string;
    receivedAt: string;
    errorCode: string;
  }): void {
    const eventType = `${input.providerEventType ?? "unknown"}.replay_mismatch`;
    this.db.prepare(
      `INSERT INTO payment_events (
         intent_id, provider_delivery_id, provider_event_id,
         provider_payment_id, provider_order_id, provider_checkout_id,
         provider_event_type, event_type, payment_id, raw_body_hash,
         event_fingerprint, outcome, error_code, received_at, payload_json
       ) VALUES (?, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 'rejected', ?, ?, NULL)`,
    ).run(
      input.intentId && this.getCheckoutIntent(input.intentId) ? input.intentId : null,
      eventType,
      eventType,
      input.rawBodyHash,
      input.fingerprint,
      input.errorCode,
      input.receivedAt,
    );
  }

  private listings(sql = LISTING_SELECT, ...params: unknown[]): Listing[] {
    return (this.db.prepare(sql).all(...params) as ListingRow[]).map(toListing);
  }

  private listingClaimantHash(id: string): string | null | undefined {
    const row = this.db.prepare(
      "SELECT claimant_token_hash FROM listings WHERE id = ?",
    ).get(id) as { claimant_token_hash: string | null } | undefined;
    return row?.claimant_token_hash;
  }

  private ensureWeek(weekId: string, referenceAt: string): void {
    const bounds = weekBounds(weekId, referenceAt);
    this.db.prepare(
      `INSERT INTO weeks (id, starts_at, ends_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(weekId, bounds.startsAt, bounds.endsAt);
  }

  private transitionIntent(intentId: string, lifecycle: IntentLifecycle): CheckoutIntent | undefined {
    const allowed = lifecyclePredecessors(lifecycle);
    const updatedAt = nowUtc().toISOString();
    this.db.prepare(
      `UPDATE checkout_intents SET lifecycle = ?, updated_at = ?
       WHERE intent_id = ? AND lifecycle IN (${allowed.map(() => "?").join(", ")})`,
    ).run(lifecycle, updatedAt, intentId, ...allowed);
    const committed = this.getCheckoutIntent(intentId);
    if (committed) this.syncCheckoutEventLifecycle(committed.intentId, committed.lifecycle);
    return committed;
  }

  private syncCheckoutEventLifecycle(intentId: string, lifecycle: IntentLifecycle): void {
    this.db.prepare(
      `UPDATE checkout_events SET outcome = ?
       WHERE intent_id = ? AND event_type = 'checkout.attached'`,
    ).run(lifecycle, intentId);
  }

  private deleteUnpaidProjection(intent: CheckoutIntent): void {
    this.db.prepare(
      `DELETE FROM unpaid_checkouts WHERE session_id = ? OR provider_checkout_id = ?`,
    ).run(intent.intentId, intent.providerCheckoutId ?? intent.intentId);
  }

  private recordCheckoutEvent(input: {
    intentId: string;
    providerCheckoutId?: string;
    eventType: string;
    outcome: string;
    errorCode?: string;
    createdAt: string;
    payloadJson?: string;
  }): void {
    this.db.prepare(
      `INSERT INTO checkout_events (
         intent_id, provider_checkout_id, event_type, raw_response_hash,
         outcome, error_code, created_at, payload_json
       ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    ).run(
      input.intentId,
      input.providerCheckoutId ?? null,
      input.eventType,
      input.outcome,
      input.errorCode ?? null,
      input.createdAt,
      input.payloadJson ?? null,
    );
  }

  private findEvent(input: {
    providerDeliveryId?: string;
    providerEventId?: string;
    providerPaymentId?: string;
    providerOrderId?: string;
    providerCheckoutId?: string;
    intentId?: string;
  }): EventRow | undefined {
    const values: string[] = [];
    const where: string[] = [];
    if (input.providerDeliveryId) { where.push("provider_delivery_id = ?"); values.push(input.providerDeliveryId); }
    if (input.providerEventId) { where.push("provider_event_id = ?"); values.push(input.providerEventId); }
    if (input.providerPaymentId) { where.push("provider_payment_id = ?"); values.push(input.providerPaymentId); }
    if (input.providerOrderId) { where.push("provider_order_id = ?"); values.push(input.providerOrderId); }
    if (input.providerCheckoutId) { where.push("provider_checkout_id = ?"); values.push(input.providerCheckoutId); }
    if (input.intentId) { where.push("intent_id = ?"); values.push(input.intentId); }
    if (!where.length) return undefined;
    return this.db.prepare(
      `SELECT id, intent_id, provider_delivery_id, provider_event_id,
              provider_payment_id, provider_order_id, provider_checkout_id,
              provider_event_type, event_type, payment_id, raw_body_hash,
              event_fingerprint, outcome, error_code, received_at, payload_json
       FROM payment_events WHERE ${where.map((item) => `(${item})`).join(" OR ")}
       ORDER BY id ASC LIMIT 1`,
    ).get(...values) as EventRow | undefined;
  }

  private paymentForAnyIdentity(
    intentId: string,
    providerCheckoutId: string | undefined,
    providerOrderId: string | undefined,
    providerPaymentId: string | undefined,
  ): PaymentRow | undefined {
    const where = ["intent_id = ?"];
    const values: string[] = [intentId];
    if (providerCheckoutId) { where.push("provider_checkout_id = ?"); values.push(providerCheckoutId); }
    if (providerOrderId) { where.push("provider_order_id = ?"); values.push(providerOrderId); }
    if (providerPaymentId) { where.push("provider_payment_id = ?"); values.push(providerPaymentId); }
    return this.db.prepare(
      `SELECT id, intent_id, listing_id, session_id, provider_checkout_id,
              provider_order_id, provider_payment_id, provider_event_id,
              provider_event_type, amount_usd, amount_cents, currency, kind,
              paid_at, created_at, outcome, error_code
       FROM payments WHERE ${where.map((item) => `(${item})`).join(" OR ")}
       ORDER BY created_at ASC LIMIT 1`,
    ).get(...values) as PaymentRow | undefined;
  }

  private paymentById(id: string): PaymentRow | undefined {
    return this.db.prepare(
      `SELECT id, intent_id, listing_id, session_id, provider_checkout_id,
              provider_order_id, provider_payment_id, provider_event_id,
              provider_event_type, amount_usd, amount_cents, currency, kind,
              paid_at, created_at, outcome, error_code
       FROM payments WHERE id = ?`,
    ).get(id) as PaymentRow | undefined;
  }

  private listingForPayment(payment: PaymentRow): Listing {
    if (!payment.listing_id) throw new Error(payment.error_code ?? "reconciliation_required");
    const listing = this.getListingById(payment.listing_id);
    if (!listing) throw new Error("payment ledger points at a missing listing");
    return listing;
  }

  private insertPayment(input: {
    event: PaidBid;
    intent: CheckoutIntent;
    listingId: string | null;
    amountCents: number;
    outcome: "applied" | "needs_reconciliation" | "rejected";
    errorCode?: string;
    createdAt: string;
  }): string {
    const paymentId = `pay_${randomUUID()}`;
    const providerCheckoutId = optionalId(input.event.providerCheckoutId) ?? input.intent.providerCheckoutId;
    this.db.prepare(
      `INSERT INTO payments (
         id, intent_id, listing_id, session_id, provider_checkout_id,
         provider_order_id, provider_payment_id, provider_event_id,
         provider_event_type, amount_usd, amount_cents, currency, kind,
         paid_at, created_at, outcome, error_code
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      paymentId,
      input.intent.intentId,
      input.listingId,
      input.event.sessionId,
      providerCheckoutId ?? null,
      optionalId(input.event.providerOrderId) ?? null,
      optionalId(input.event.providerPaymentId) ?? null,
      optionalId(input.event.providerEventId) ?? null,
      optionalId(input.event.providerEventType) ?? null,
      input.amountCents / 100,
      input.amountCents,
      input.event.currency?.toUpperCase() ?? input.intent.currency,
      input.intent.kind,
      normalizedPaidAt(input.event.paidAt),
      input.createdAt,
      input.outcome,
      input.errorCode ?? null,
    );
    return paymentId;
  }

  private insertPaymentEvent(input: {
    event: PaidBid;
    intent?: CheckoutIntent;
    paymentId?: string;
    fingerprint: string;
    rawBodyHash: string;
    outcome: string;
    errorCode?: string;
    receivedAt: string;
  }): void {
    const eventIntentId = input.intent?.intentId ??
      (input.event.intentId && this.getCheckoutIntent(input.event.intentId)
        ? input.event.intentId
        : null);
    this.db.prepare(
      `INSERT INTO payment_events (
         intent_id, provider_delivery_id, provider_event_id,
         provider_payment_id, provider_order_id, provider_checkout_id,
         provider_event_type, event_type, payment_id, raw_body_hash,
         event_fingerprint, outcome, error_code, received_at, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      eventIntentId,
      optionalId(input.event.providerDeliveryId) ?? null,
      optionalId(input.event.providerEventId) ?? null,
      optionalId(input.event.providerPaymentId) ?? null,
      optionalId(input.event.providerOrderId) ?? null,
      optionalId(input.event.providerCheckoutId) ?? input.intent?.providerCheckoutId ?? null,
      optionalId(input.event.providerEventType) ?? input.event.kind ?? "legacy.payment",
      optionalId(input.event.providerEventType) ?? input.event.kind ?? "legacy.payment",
      input.paymentId ?? null,
      input.rawBodyHash,
      input.fingerprint,
      input.outcome,
      input.errorCode ?? null,
      input.receivedAt,
    );
  }
}

function isAppDb(value: unknown): value is AppDb {
  return typeof value === "object" && value !== null &&
    typeof (value as AppDb).prepare === "function" &&
    typeof (value as AppDb).transaction === "function";
}

export { Store as PlaylistStore };

export function createStore(options: StoreOptions | string | AppDb = {}): Store {
  return new Store(options);
}

let sharedStore: Store | undefined;
let sharedPath: string | undefined;

function defaultStore(): Store {
  const path = defaultDatabasePath();
  if (!sharedStore || sharedPath !== path) {
    sharedStore?.close();
    sharedStore = createStore(path);
    sharedPath = path;
  }
  return sharedStore;
}

export function getDb(): AppDb {
  return defaultStore().db;
}

/** Shared connection for provider adapters in a process (not an in-memory map). */
export function getStore(): Store {
  return defaultStore();
}

export function resetListings(): void {
  defaultStore().reset();
}

export function listPaidInRollingWeek(now: Date = nowUtc()): Listing[] {
  return defaultStore().listPaidInRollingWeek(now);
}

export function listPaidForWeek(weekId: string): Listing[] {
  return defaultStore().listPaidForWeek(weekId);
}

export function listUnpaid(weekId: string): UnpaidTrack[] {
  return defaultStore().listUnpaid(weekId);
}

export function rememberUnpaidCheckout(input: UnpaidTrack): void {
  defaultStore().rememberUnpaidCheckout(input);
}

export function forgetUnpaidCheckout(sessionId: string): void {
  defaultStore().forgetUnpaidCheckout(sessionId);
}

export function getListingById(id: string): Listing | undefined {
  return defaultStore().getListingById(id);
}

export function incrementListingClicks(id: string): Listing | undefined {
  return defaultStore().incrementListingClicks(id);
}

export function findPaidByListenUrl(listenUrl: string, now: Date = nowUtc()): Listing | undefined {
  return defaultStore().findPaidByListenUrl(listenUrl, now);
}

export function listingForSession(sessionId: string): Listing | undefined {
  return defaultStore().listingForSession(sessionId);
}

export function applyPaidEvent(event: PaidBid): Listing {
  return defaultStore().applyPaidEvent(event);
}

export function createCheckoutIntent(input: CheckoutIntentInput): CheckoutIntent {
  return defaultStore().createCheckoutIntent(input);
}

export function attachCheckoutIntent(input: {
  intentId: string;
  providerCheckoutId: string;
  checkoutUrl?: string;
  expiresAt?: string;
}): CheckoutIntent {
  return defaultStore().attachCheckoutIntent(input);
}

export function getCheckoutIntent(intentId: string): CheckoutIntent | undefined {
  return defaultStore().getCheckoutIntent(intentId);
}
