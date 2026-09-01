import { assertWaffoModeAllowed, waffoMode, type WaffoEnv } from "../config";
import { MIN_BID_USD } from "../core/rank";
import { canonicalizeListenUrl, isNsfwCopy, UrlError } from "../core/url";
import { FixturePayment, getFixturePayment } from "./fixture";
import { WaffoPayment } from "./waffo";

export type CheckoutKind = "create" | "raise";

export type ListingDraft = {
  track: string;
  artist: string;
  listenUrl: string;
  weekId: string;
};

export type CreateCheckoutInput = {
  listingDraft: ListingDraft;
  amountUsd: number;
  kind: CheckoutKind;
  /** Local durable intent created before the provider call. */
  intentId?: string;
  amountCents?: number;
  metadata?: Record<string, string>;
};

export type CheckoutStart = {
  checkoutUrl: string;
  sessionId: string;
  providerCheckoutId?: string;
  intentId?: string;
  expiresAt?: string;
};

export type CheckoutStatus = "open" | "paid" | "abandoned";

export type CheckoutRecord = {
  sessionId: string;
  status: CheckoutStatus;
  checkoutUrl: string;
  listingDraft: ListingDraft;
  amountUsd: number;
  kind: CheckoutKind;
  paidAt?: string;
  intentId?: string;
};

export type PaidEvent = {
  sessionId: string;
  intentId?: string;
  listingDraft: ListingDraft;
  amountUsd: number;
  amountCents?: number;
  kind: CheckoutKind;
  paidAt: string;
  currency?: string;
  productId?: string;
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
};

export type WebhookResult = PaidEvent | {
  ignored: true;
  reason?: string;
  intentId?: string;
  providerCheckoutId?: string;
};

export type PaymentPort = {
  readonly kind: "fixture" | "live";
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart>;
  handleWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookResult>;
  getCheckout(sessionId: string): CheckoutRecord | undefined;
  completeCheckout(sessionId: string): Promise<PaidEvent>;
  abandonCheckout(sessionId: string): Promise<void>;
};

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CheckoutError";
  }
}

const PLAY_COUNT_KEYS = [
  "playCount",
  "play_count",
  "plays",
  "streams",
  "streamCount",
  "monthlyListeners",
  "views",
];

export function parseAmountUsd(raw: unknown): number {
  if (typeof raw === "boolean") {
    throw new CheckoutError("bid_not_whole", 400);
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      throw new CheckoutError("bid_not_whole", 400);
    }
    if (!Number.isInteger(raw)) {
      throw new CheckoutError("bid_not_whole", 400);
    }
    return assertMinBid(raw);
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CheckoutError("bid_not_whole", 400);
  }
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!/^\d+$/.test(trimmed)) {
    throw new CheckoutError("bid_not_whole", 400);
  }
  return assertMinBid(Number(trimmed));
}

function assertMinBid(value: number): number {
  if (value < MIN_BID_USD) {
    throw new CheckoutError("bid_below_min", 400);
  }
  return value;
}

export function rejectPlayCounts(input: Record<string, unknown>): void {
  for (const key of PLAY_COUNT_KEYS) {
    const value = input[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      throw new CheckoutError("play_count_forbidden", 400);
    }
  }
}

export function parseListingDraft(
  input: Record<string, unknown>,
  weekId: string,
): ListingDraft {
  rejectPlayCounts(input);
  const track = readText(input.track, "track");
  const artist = readText(input.artist, "artist");
  if (isNsfwCopy(track) || isNsfwCopy(artist)) {
    throw new CheckoutError("url_forbidden", 400);
  }
  const listenUrl = parseListenUrl(input.listenUrl);
  return { track, artist, listenUrl, weekId };
}

function readText(raw: unknown, field: string): string {
  if (typeof raw !== "string") {
    throw new CheckoutError("invalid_listing", 400, `${field} is required`);
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new CheckoutError("invalid_listing", 400, `${field} must be 1–80 characters`);
  }
  return trimmed;
}

function parseListenUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CheckoutError("url_insecure", 400);
  }
  try {
    return canonicalizeListenUrl(raw);
  } catch (error) {
    if (error instanceof UrlError) {
      throw new CheckoutError(error.code, error.httpStatus);
    }
    throw error;
  }
}

export function createPaymentPort(env: WaffoEnv = process.env): PaymentPort {
  const mode = waffoMode(env);
  assertWaffoModeAllowed(mode, env);
  if (mode === "fixture") return env === process.env ? getFixturePayment() : new FixturePayment();
  return new WaffoPayment({ env });
}

let defaultPort: PaymentPort | undefined;
let defaultPortMode: string | undefined;

/** Shared adapter so checkout, webhook, and /return see the same sessions. */
export function getPaymentPort(env: WaffoEnv = process.env): PaymentPort {
  if (env !== process.env) {
    return createPaymentPort(env);
  }
  const mode = env.WAFFO_MODE ?? "";
  const portKey = [
    mode,
    env.NODE_ENV ?? "",
    env.DATABASE_PATH ?? "",
    env.PUBLIC_BASE_URL ?? "",
    env.WAFFO_API_BASE ?? "",
    env.WAFFO_MERCHANT_ID ?? "",
    env.WAFFO_STORE_ID ?? "",
    env.WAFFO_PRODUCT_ID ?? "",
    env.WAFFO_PRODUCT_NAME ?? "",
    env.WAFFO_WEBHOOK_PUBLIC_KEY ?? "",
    env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY ?? "",
    env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY ?? "",
    env.WAFFO_TIMEOUT_MS ?? "",
  ].join("|");
  if (!defaultPort || defaultPortMode !== portKey) {
    defaultPort = createPaymentPort(env);
    defaultPortMode = portKey;
  }
  return defaultPort;
}

export function resetPaymentPort(): void {
  defaultPort = undefined;
  defaultPortMode = undefined;
  getFixturePayment().reset();
}
