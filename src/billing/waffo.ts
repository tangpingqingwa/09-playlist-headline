import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import {
  TaxCategory,
  WaffoPancake,
  WaffoPancakeError,
  verifyWebhook,
} from "@waffo/pancake-ts";
import {
  assertWaffoModeAllowed,
  assertRuntimeReadiness,
  requireHttpsPublicBaseUrl,
  waffoApiBase,
  waffoEnvironment,
  waffoMode,
  type WaffoEnv,
} from "../config";
import {
  centsToDisplayString,
  displayStringToCents,
  usdToCents,
} from "../core/money";
import {
  createStore,
  getStore,
  metadataFingerprint,
  sha256,
  stableJson,
  type CheckoutIntent,
  type Store,
} from "../core/store";
import type {
  CheckoutKind,
  CheckoutRecord,
  CheckoutStart,
  CreateCheckoutInput,
  ListingDraft,
  PaidEvent,
  PaymentPort,
  WebhookResult,
} from "./port";

type StoredCheckout = CheckoutRecord & { metadata?: Record<string, string> };

type WebhookData = Record<string, unknown>;

export type WaffoPaymentOptions = {
  env?: WaffoEnv;
  fetch?: typeof fetch;
  store?: Store;
  webhookPublicKey?: string;
};

const DEFAULT_WAFFO_TIMEOUT_MS = 10_000;
const WAFFO_CHECKOUT_HOST = "pancake.waffo.ai";
const WAFFO_SHORT_ID = /^[A-Z]{2,5}_[0-9A-Za-z]{22}$/;
const WAFFO_STORE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AMBIGUOUS_PROVIDER_STATUSES = new Set([408, 409, 425, 429]);

/** Official Waffo Pancake adapter. The fixture adapter is selected separately. */
export class WaffoPayment implements PaymentPort {
  readonly kind = "live" as const;
  private readonly env: WaffoEnv;
  private readonly mode: ReturnType<typeof waffoMode>;
  private readonly fetchFn: typeof fetch;
  private readonly store: Store;
  private readonly client: WaffoPancake;
  private readonly webhookPublicKey: string;
  private readonly sessions = new Map<string, StoredCheckout>();

  constructor(options: WaffoPaymentOptions = {}) {
    this.env = options.env ?? process.env;
    this.mode = waffoMode(this.env);
    assertWaffoModeAllowed(this.mode, this.env);
    if (this.mode === "fixture") throw new Error("WaffoPayment requires waffo-test or waffo-prod");
    assertRuntimeReadiness(this.env, options.webhookPublicKey);
    this.fetchFn = withTimeout(options.fetch ?? fetch, requestTimeoutMs(this.env));
    const merchantId = required(this.env, "WAFFO_MERCHANT_ID");
    const storeId = required(this.env, "WAFFO_STORE_ID");
    const productId = required(this.env, "WAFFO_PRODUCT_ID");
    assertShortId("WAFFO_MERCHANT_ID", merchantId, "MER");
    assertShortId("WAFFO_STORE_ID", storeId, "STO");
    assertShortId("WAFFO_PRODUCT_ID", productId, "PROD");
    const privateKey = readPrivateKey(this.env);
    const publicBaseUrl = requireHttpsPublicBaseUrl(this.env);
    const database = this.env.DATABASE_PATH?.trim();
    if (!database ||
        (this.mode === "waffo-prod" &&
          (database === ":memory:" ||
            database.toLowerCase().startsWith("file::memory:") ||
            database.toLowerCase().includes("mode=memory")))) {
      throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
    }
    if (this.mode === "waffo-prod" && this.env.NODE_ENV !== "production") {
      /* Explicit prod mode is still production-like, even in a local shell. */
      if (!publicBaseUrl.startsWith("https://")) {
        throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must use HTTPS");
      }
    }
    const webhookKeyName = this.mode === "waffo-prod"
      ? "WAFFO_WEBHOOK_PROD_PUBLIC_KEY"
      : "WAFFO_WEBHOOK_TEST_PUBLIC_KEY";
    this.webhookPublicKey = options.webhookPublicKey?.trim() ||
      this.env[webhookKeyName]?.trim() || "";
    if (!this.webhookPublicKey) throw new Error(`BLOCKED-CONFIG: ${webhookKeyName}`);
    assertRsaPublicKey(webhookKeyName, this.webhookPublicKey);
    this.store = options.store ?? (this.env === process.env ? getStore() : createStore(database));
    this.client = new WaffoPancake({
      merchantId,
      privateKey,
      baseUrl: waffoApiBase(this.env, this.mode),
      fetch: this.fetchFn,
      webhookPublicKey: this.webhookPublicKey,
    });
    /* Validate these before the first network call; the SDK also validates IDs. */
    void storeId;
    void productId;
    void publicBaseUrl;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    const intentId = input.intentId?.trim();
    if (!intentId) throw new Error("intent_id_required");
    const intent = this.store.getCheckoutIntent(intentId);
    if (!intent) throw new Error("unknown_intent");
    if (intent.lifecycle === "rejected") throw new Error("intent_rejected");
    if (intent.lifecycle === "needs_reconciliation") throw new Error("reconciliation_required");
    if (intent.lifecycle === "abandoned") throw new Error("checkout_abandoned");
    if (intent.lifecycle === "paid" && (!intent.providerCheckoutId || !intent.checkoutUrl)) {
      throw new Error("payment_already_settled");
    }
    const productId = required(this.env, "WAFFO_PRODUCT_ID");
    let requestedCents: number;
    let chargeCents: number;
    try {
      requestedCents = usdToCents(input.amountUsd);
      chargeCents = input.amountCents ?? requestedCents;
    } catch {
      throw new Error("amount_mismatch");
    }
    if (!Number.isSafeInteger(chargeCents) || chargeCents < 100 || requestedCents !== chargeCents) {
      throw new Error("amount_mismatch");
    }
    if (
      intent.kind !== input.kind ||
      intent.chargeCents !== chargeCents ||
      intent.track !== input.listingDraft.track ||
      intent.artist !== input.listingDraft.artist ||
      intent.listenUrl !== input.listingDraft.listenUrl ||
      intent.weekId !== input.listingDraft.weekId ||
      intent.productId !== productId
    ) {
      throw new Error("intent_mismatch");
    }
    if (input.metadata && metadataFingerprint(input.metadata) !== intent.metadataFingerprint) {
      throw new Error("intent_mismatch");
    }
    if (intent.providerCheckoutId && intent.checkoutUrl) {
      const sessionId = intent.providerCheckoutId;
      this.sessions.set(sessionId, {
        sessionId,
        status: intent.lifecycle === "paid" ? "paid" : "open",
        checkoutUrl: intent.checkoutUrl,
        listingDraft: {
          track: intent.track,
          artist: intent.artist,
          listenUrl: intent.listenUrl,
          weekId: intent.weekId,
        },
        amountUsd: intent.chargeCents / 100,
        kind: intent.kind,
        intentId: intent.intentId,
        metadata: intent.metadata,
      });
      return {
        sessionId,
        providerCheckoutId: sessionId,
        intentId: intent.intentId,
        checkoutUrl: intent.checkoutUrl,
        expiresAt: intent.expiresAt,
      };
    }
    const metadata = metadataForCheckout(input, intentId, intent.metadata);
    let result: Awaited<ReturnType<WaffoPancake["checkout"]["anonymous"]["create"]>>;
    try {
      result = await this.client.checkout.anonymous.create({
        productId,
        currency: "USD",
        priceSnapshot: {
          amount: centsToDisplayString(chargeCents),
          taxCategory: TaxCategory.DigitalGoods,
        },
        successUrl: `${requireHttpsPublicBaseUrl(this.env)}/checkout/complete?intent=${encodeURIComponent(intentId)}`,
        orderMerchantExternalId: intentId,
        metadata,
      });
    } catch (error) {
      const definitive = isDefinitiveProviderRejection(error);
      if (definitive) this.store.markIntentRejected(intentId, `waffo_${error.status}`);
      else this.store.markIntentUnknown(intentId, "waffo_ambiguous");
      throw new Error(definitive ? "waffo_rejected" : "waffo_ambiguous");
    }
    let checkoutUrl: string;
    let sessionId: string;
    let expiresAt: string;
    try {
      if (!isRecord(result)) throw new Error("response_shape");
      sessionId = responseString(result.sessionId, "session_id");
      checkoutUrl = validateWaffoCheckoutUrl(
        responseString(result.checkoutUrl, "checkout_url"),
        sessionId,
      );
      expiresAt = validateWaffoExpiry(result.expiresAt);
    } catch {
      this.store.markIntentUnknown(intentId, "waffo_invalid_response");
      throw new Error("waffo_ambiguous");
    }
    try {
      this.store.attachCheckoutIntent({
        intentId,
        providerCheckoutId: sessionId,
        checkoutUrl,
        expiresAt,
      });
    } catch {
      /* The provider accepted the request but local correlation is uncertain. */
      this.store.markIntentUnknown(intentId, "checkout_attach_failed");
      throw new Error("waffo_ambiguous");
    }
    const record: StoredCheckout = {
      sessionId,
      status: "open",
      checkoutUrl,
      listingDraft: { ...input.listingDraft },
      amountUsd: input.amountUsd,
      kind: input.kind,
      intentId,
    };
    this.sessions.set(sessionId, record);
    return {
      sessionId,
      providerCheckoutId: sessionId,
      intentId,
      checkoutUrl,
      expiresAt,
    };
  }

  getCheckout(sessionId: string): CheckoutRecord | undefined {
    /* The SQLite intent is authoritative after a webhook/restart. The map is
       only a short-lived response cache and must not hide a durable paid or
       reconciled lifecycle. */
    const intent = this.store.findCheckoutIntentByProviderCheckoutId(sessionId) ??
      this.store.getCheckoutIntent(sessionId);
    if (intent) {
      return {
        sessionId: intent.providerCheckoutId ?? intent.intentId,
        status: intent.lifecycle === "paid"
          ? "paid"
          : intent.lifecycle === "abandoned"
            ? "abandoned"
            : "open",
        checkoutUrl: intent.checkoutUrl ?? "",
        listingDraft: {
          track: intent.track,
          artist: intent.artist,
          listenUrl: intent.listenUrl,
          weekId: intent.weekId,
        },
        amountUsd: intent.chargeCents / 100,
        kind: intent.kind,
        intentId: intent.intentId,
      };
    }
    const memory = this.sessions.get(sessionId);
    if (memory) return { ...memory, listingDraft: { ...memory.listingDraft } };
    return undefined;
  }

  async completeCheckout(sessionId: string): Promise<PaidEvent> {
    throw new Error(`live Waffo session ${sessionId} completes via webhook only`);
  }

  async abandonCheckout(sessionId: string): Promise<void> {
    const intent = this.store.getCheckoutIntent(sessionId) ??
      this.store.findCheckoutIntentByProviderCheckoutId(sessionId);
    if (intent) this.store.abandonCheckoutIntent(intent.intentId);
    const memory = this.sessions.get(sessionId);
    if (memory && memory.status === "open") memory.status = "abandoned";
  }

  async handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    const signature = header(headers, "x-waffo-signature");
    const environment = waffoEnvironment(this.mode);
    let event: ReturnType<typeof verifyWebhook>;
    try {
      event = verifyWebhook(rawBody, signature, {
        environment,
        publicKey: this.webhookPublicKey,
      });
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(`invalid Waffo webhook signature${detail}`);
    }

    const data = isRecord(event.data) ? event.data : {};
    const common = eventIdentity(event, data, rawBody);
    for (const [value, errorCode] of [
      [common.providerDeliveryId, "delivery_id_missing"],
      [common.providerEventId, "business_event_id_missing"],
    ] as const) {
      if (!value) {
        const recorded = this.store.recordProviderEvent({
          ...common,
          outcome: "rejected",
          errorCode,
        });
        if (recorded === "duplicate") {
          return { ignored: true, reason: errorCode, intentId: common.intentId };
        }
        throw new Error(errorCode);
      }
    }
    if (event.eventType !== "order.completed") {
      this.store.recordProviderEvent({
        ...common,
        outcome: "ignored",
        errorCode: "unsupported_event_type",
      });
      return { ignored: true, reason: "unsupported_event_type", intentId: common.intentId };
    }

    const intentId = stringValue(data.orderMerchantExternalId);
    const metadata = recordStrings(data.orderMetadata);
    const intent = intentId ? this.store.getCheckoutIntent(intentId) : undefined;
    if (!intent) {
      this.store.recordProviderEvent({
        ...common,
        intentId,
        outcome: "rejected",
        errorCode: "unknown_intent",
      });
      return { ignored: true, reason: "unknown_intent", intentId };
    }
    try {
      this.validateCompletedEvent(event, data, metadata, intent);
    } catch (error) {
      const code = error instanceof Error ? error.message : "event_mismatch";
      const recorded = this.store.recordProviderEvent({
        ...common,
        intentId,
        outcome: "rejected",
        errorCode: code,
      });
      if (recorded === "duplicate") {
        return { ignored: true, reason: code, intentId };
      }
      throw new Error(code);
    }

    const amountCents = this.eventAmountCents(data, intent);
    const paidAt = validTimestamp(event.timestamp);
    const providerCheckoutId = checkoutIdFromData(data);
    const paid: PaidEvent = {
      sessionId: intent.intentId,
      intentId: intent.intentId,
      listingDraft: {
        track: intent.track,
        artist: intent.artist,
        listenUrl: intent.listenUrl,
        weekId: intent.weekId,
      },
      amountUsd: amountCents / 100,
      amountCents,
      kind: intent.kind,
      paidAt,
      currency: intent.currency,
      productId: intent.productId,
      metadata,
      metadataFingerprint: metadataFingerprint(metadata),
      providerCheckoutId,
      providerDeliveryId: common.providerDeliveryId,
      providerEventId: common.providerEventId,
      providerPaymentId: common.providerPaymentId,
      providerOrderId: common.providerOrderId,
      providerEventType: event.eventType,
      rawBodyHash: common.rawBodyHash,
      eventFingerprint: common.eventFingerprint,
    };
    /* Do not mark the process-local cache paid here. The canonical route must
       first commit the verified event and rank mutation atomically; durable
       intent state is the only source of truth across retries/restarts. */
    return paid;
  }

  private validateCompletedEvent(
    event: ReturnType<typeof verifyWebhook>,
    data: WebhookData,
    metadata: Record<string, string>,
    intent: CheckoutIntent,
  ): void {
    validTimestamp(event.timestamp);
    if (event.mode !== waffoEnvironment(this.mode)) throw new Error("mode_mismatch");
    if (event.storeId !== required(this.env, "WAFFO_STORE_ID")) throw new Error("store_mismatch");
    if (stringValue(data.orderStatus) !== "completed") throw new Error("order_not_completed");
    if (stringValue(data.paymentStatus) !== "succeeded") throw new Error("payment_not_succeeded");
    if (!stringValue(data.paymentId)) throw new Error("payment_id_missing");
    if (!stringValue(data.orderId)) throw new Error("order_id_missing");
    const checkoutId = checkoutIdFromData(data);
    /* The official Waffo webhook schema correlates a checkout through the
       signed orderMerchantExternalId. Some historical/private payloads also
       echo a checkout ID; when present it is an additional strict check, never
       a required field that would reject the documented order.completed shape. */
    if (checkoutId && intent.providerCheckoutId && checkoutId !== intent.providerCheckoutId) {
      throw new Error("checkout_mismatch");
    }
    if (event.eventId !== stringValue(data.paymentId)) throw new Error("payment_event_id_mismatch");
    if (stringValue(data.orderMerchantExternalId) !== intent.intentId) throw new Error("intent_mismatch");
    if (!isRecord(data.orderMetadata) ||
        Object.values(data.orderMetadata).some((value) => typeof value !== "string")) {
      throw new Error("metadata_invalid");
    }
    if (metadata.intentId !== intent.intentId) throw new Error("metadata_intent_mismatch");
    if (metadata.intentFingerprint !== intent.intentFingerprint) throw new Error("metadata_fingerprint_mismatch");
    if (metadataFingerprint(metadata) !== intent.metadataFingerprint) throw new Error("metadata_mismatch");
    const fields: Record<string, string> = {
      canonicalUrl: intent.listenUrl,
      track: intent.track,
      artist: intent.artist,
      weekId: intent.weekId,
      kind: intent.kind,
      productId: intent.productId,
      currency: intent.currency,
      taxCategory: intent.taxCategory,
      targetBidCents: String(intent.targetBidCents),
      currentBidCents: String(intent.currentBidCents),
      chargeCents: String(intent.chargeCents),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (metadata[key] !== value) throw new Error(`metadata_${key}_mismatch`);
    }
    if (stringValue(data.currency) !== "USD") throw new Error("currency_mismatch");
    const productName = stringValue(data.productName);
    const expectedProductName = this.env.WAFFO_PRODUCT_NAME?.trim() || "Rank";
    if (!productName || productName !== expectedProductName) throw new Error("product_mismatch");
    const eventProductId = stringValue(data.productId);
    if (!eventProductId || eventProductId !== intent.productId) throw new Error("product_mismatch");
    if (data.productMetadata !== undefined) {
      if (!isRecord(data.productMetadata) ||
          Object.values(data.productMetadata).some((value) => typeof value !== "string")) {
        throw new Error("product_metadata_invalid");
      }
      const productMetadata = data.productMetadata as Record<string, string>;
      const metadataProductId = productMetadata.productId ?? productMetadata.product_id;
      if (metadataProductId && metadataProductId !== intent.productId) {
        throw new Error("product_mismatch");
      }
      const metadataTaxCategory = productMetadata.taxCategory ?? productMetadata.tax_category;
      if (metadataTaxCategory && metadataTaxCategory !== intent.taxCategory) {
        throw new Error("tax_category_mismatch");
      }
    }
    const eventTaxCategory = stringValue(data.taxCategory);
    if (eventTaxCategory && eventTaxCategory !== intent.taxCategory) {
      throw new Error("tax_category_mismatch");
    }
    this.eventAmountCents(data, intent);
  }

  private eventAmountCents(data: WebhookData, intent: CheckoutIntent): number {
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(data, key);
    const parseMoney = (key: string, requiredField: boolean): number | undefined => {
      if (!has(key)) {
        if (requiredField) throw new Error(`${key === "taxAmount" ? "tax_amount" : key}_invalid`);
        return undefined;
      }
      const raw = data[key];
      const parsed = displayStringToCents(raw);
      if (parsed === undefined) {
        throw new Error(`${key === "taxAmount" ? "tax_amount" : key}_invalid`);
      }
      return parsed;
    };
    const taxAmount = parseMoney("taxAmount", true) as number;
    const amount = parseMoney("amount", true) as number;
    const subtotal = parseMoney("subtotal", false);
    const total = parseMoney("total", false);
    const expected = intent.chargeCents;
    if (subtotal !== undefined) {
      if (subtotal !== expected) throw new Error("amount_mismatch");
      const expectedTotal = subtotal + taxAmount;
      if (amount !== expectedTotal || (total !== undefined && total !== expectedTotal)) {
        throw new Error("amount_mismatch");
      }
      return subtotal;
    }
    /* Waffo's fallback payload has no subtotal. It is safe only when the
       signed tax is exactly zero and both amount fields agree with the local
       immutable charge. */
    if (taxAmount !== 0 || amount !== expected || (total !== undefined && total !== expected)) {
      throw new Error("amount_mismatch");
    }
    return expected;
  }
}

function assertShortId(name: string, value: string, prefix: string): void {
  if (!WAFFO_SHORT_ID.test(value) || !value.startsWith(`${prefix}_`)) {
    throw new Error(`BLOCKED-CONFIG: ${name} must be a ${prefix}_ Short ID`);
  }
}

function assertRsaPublicKey(name: string, value: string): void {
  try {
    const normalized = value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
    const key = createPublicKey(normalized);
    if (key.asymmetricKeyType !== "rsa") throw new Error("not rsa");
  } catch {
    throw new Error(`BLOCKED-CONFIG: ${name} must be an RSA public key`);
  }
}

function isDefinitiveProviderRejection(error: unknown): error is WaffoPancakeError {
  if (!(error instanceof WaffoPancakeError)) return false;
  const status: unknown = error.status;
  if (typeof status !== "number" || !Number.isInteger(status) || status < 400 || status >= 500) {
    return false;
  }
  if (AMBIGUOUS_PROVIDER_STATUSES.has(status)) return false;
  /* The SDK uses this error for a body it could not parse. A status code alone
     cannot prove that Waffo rejected a request whose response was incomplete. */
  const entries: unknown = error.errors;
  if (!Array.isArray(entries) || entries.length === 0 || !entries.every(isProviderErrorEntry)) {
    return false;
  }
  if (entries.some((entry) =>
    entry.layer === "sdk" && entry.message.startsWith("Non-JSON response"))) {
    return false;
  }
  return true;
}

function isProviderErrorEntry(value: unknown): value is { layer: string; message: string } {
  return isRecord(value) &&
    typeof value.layer === "string" && value.layer.trim() !== "" &&
    typeof value.message === "string" && value.message.trim() !== "";
}

export function validateWaffoCheckoutUrl(value: unknown, expectedSessionId: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error("waffo_checkout_url_invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("waffo_checkout_url_invalid");
  }
  if (parsed.toString() !== value) throw new Error("waffo_checkout_url_invalid");
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(value)?.[1]?.toLowerCase();
  let segments: string[];
  try {
    const rawSegments = parsed.pathname.split("/").slice(1);
    segments = rawSegments.map((segment) => decodeURIComponent(segment));
    /* Keep the persisted URL in the documented canonical form. */
    if (segments.some((segment, index) => segment !== rawSegments[index])) {
      throw new Error("encoded_path");
    }
  } catch {
    throw new Error("waffo_checkout_url_invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== WAFFO_CHECKOUT_HOST ||
    authority !== WAFFO_CHECKOUT_HOST ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    segments.length !== 4 ||
    segments[0] !== "store" ||
    !WAFFO_STORE_SLUG.test(segments[1] ?? "") ||
    segments[2] !== "checkout" ||
    segments[3] !== expectedSessionId
  ) {
    throw new Error("waffo_checkout_url_invalid");
  }
  return parsed.toString();
}

export const MAX_WAFFO_CHECKOUT_TTL_MS = 48 * 60 * 60 * 1000;
const CANONICAL_UTC_EXPIRY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function validateWaffoExpiry(value: unknown, now = new Date()): string {
  if (typeof value !== "string" || !CANONICAL_UTC_EXPIRY.test(value)) {
    throw new Error("waffo_expiry_invalid");
  }
  const parsed = new Date(value);
  const nowMs = now.getTime();
  if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(nowMs) ||
      parsed.toISOString() !== value ||
      parsed.getTime() <= nowMs ||
      parsed.getTime() > nowMs + MAX_WAFFO_CHECKOUT_TTL_MS) {
    throw new Error("waffo_expiry_invalid");
  }
  return value;
}

function responseString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${name}_invalid`);
  }
  return value;
}

function required(env: WaffoEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`BLOCKED-CONFIG: ${name}`);
  return value;
}

function requestTimeoutMs(env: WaffoEnv): number {
  const raw = env.WAFFO_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_WAFFO_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 120_000) {
    throw new Error("BLOCKED-CONFIG: WAFFO_TIMEOUT_MS");
  }
  return value;
}

function withTimeout(fetchFn: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const sourceSignals: AbortSignal[] = [];
    if (init?.signal) sourceSignals.push(init.signal);
    if (typeof Request !== "undefined" && input instanceof Request && input.signal) {
      sourceSignals.push(input.signal);
    }
    const sourceListeners: Array<{ source: AbortSignal; listener: () => void }> = [];
    let rejectSource: ((reason?: unknown) => void) | undefined;
    const sourceAbort = sourceSignals.length
      ? new Promise<never>((_, reject) => {
          rejectSource = reject;
          const abort = (source: AbortSignal): void => {
            if (!controller.signal.aborted) controller.abort(source.reason);
            rejectSource?.(new Error("waffo_request_aborted"));
          };
          for (const source of sourceSignals) {
            const listener = (): void => abort(source);
            sourceListeners.push({ source, listener });
            if (source.aborted) listener();
            else source.addEventListener("abort", listener, { once: true });
          }
        })
      : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = Promise.resolve().then(() => fetchFn(input, {
      ...init,
      signal: controller.signal,
    }));
    const deadline = new Promise<Response>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("waffo_request_timeout");
        if (!controller.signal.aborted) controller.abort(error);
        reject(new Error("waffo_request_timeout"));
      }, timeoutMs);
      timer.unref?.();
    });
    try {
      const responsePromises: Array<Promise<Response>> = [request, deadline];
      if (sourceAbort) responsePromises.push(sourceAbort);
      const response = await Promise.race(responsePromises);

      /* The official SDK calls response.json() after fetch resolves. Consume
         that body under the same deadline so headers-only resolution cannot
         strand an immutable intent while a provider body stalls. */
      const bodyPromises: Array<Promise<unknown>> = [
        Promise.resolve().then(() => response.json()),
        deadline,
      ];
      if (sourceAbort) bodyPromises.push(sourceAbort);
      const body = await Promise.race(bodyPromises);
      return new Response(JSON.stringify(body), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      if (timer) clearTimeout(timer);
      for (const { source, listener } of sourceListeners) {
        source.removeEventListener("abort", listener);
      }
      rejectSource = undefined;
    }
  };
}

function readPrivateKey(env: WaffoEnv): string {
  const inline = env.WAFFO_PRIVATE_KEY?.trim();
  if (inline) return inline.replace(/\\n/g, "\n");
  const file = env.WAFFO_PRIVATE_KEY_FILE?.trim();
  if (file) {
    try {
      const value = readFileSync(file, "utf8").trim();
      if (value) return value;
    } catch {
      throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY_FILE");
    }
  }
  throw new Error("BLOCKED-CONFIG: WAFFO_PRIVATE_KEY");
}

function metadataForCheckout(
  input: CreateCheckoutInput,
  intentId: string,
  storedMetadata: Record<string, string>,
): Record<string, string> {
  return {
    ...storedMetadata,
    intentId,
    chargeCents: String(input.amountCents ?? usdToCents(input.amountUsd)),
    track: input.listingDraft.track,
    artist: input.listingDraft.artist,
    canonicalUrl: input.listingDraft.listenUrl,
    weekId: input.listingDraft.weekId,
    kind: input.kind,
  };
}

function eventIdentity(
  event: ReturnType<typeof verifyWebhook>,
  data: WebhookData,
  rawBody: string,
) {
  const providerDeliveryId = stringValue(event.id);
  const providerEventId = stringValue(event.eventId);
  const providerPaymentId = stringValue(data.paymentId);
  const providerOrderId = stringValue(data.orderId);
  const providerCheckoutId = checkoutIdFromData(data);
  const intentId = stringValue(data.orderMerchantExternalId);
  const rawBodyHash = sha256(rawBody);
  return {
    intentId,
    providerDeliveryId,
    providerEventId,
    providerPaymentId,
    providerOrderId,
    providerCheckoutId,
    providerEventType: event.eventType,
    rawBodyHash,
    /* The normalized business fingerprint deliberately excludes delivery ID
       and raw-body formatting. Delivery identity is checked separately; a
       second delivery of the same Waffo business event is a no-op when all
       signed business facts are unchanged. */
    eventFingerprint: sha256(stableJson({
      providerEventId,
      providerPaymentId,
      providerOrderId,
      providerCheckoutId,
      providerEventType: event.eventType,
      intentId,
      mode: event.mode,
      storeId: event.storeId,
      timestamp: canonicalTimestamp(event.timestamp),
      data,
    })),
  };
}

function recordStrings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === "string") as Array<[string, string]>,
  );
}

function checkoutIdFromData(data: WebhookData): string | undefined {
  /* Waffo's documented payload is camelCase; retain the snake_case alias for
     signed historical deliveries without ever accepting an unsigned query
     parameter or a different identity source. */
  return stringValue(data.checkoutId) ??
    stringValue(data.checkout_id) ??
    stringValue(data.checkoutSessionId) ??
    stringValue(data.checkout_session_id);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function validTimestamp(value: unknown): string {
  const timestamp = typeof value === "string" ? value : "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("event_timestamp_invalid");
  return date.toISOString();
}

function canonicalTimestamp(value: unknown): string {
  try {
    return validTimestamp(value);
  } catch {
    return typeof value === "string" ? value : "";
  }
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === needle) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
