import { randomUUID } from "node:crypto";
import { nowUtc } from "../core/week";
import { usdToCents } from "../core/money";
import { getStore, type Store } from "../core/store";
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

/** Offline-only provider. It never creates a session from webhook metadata. */
export class FixturePayment implements PaymentPort {
  constructor(private readonly durable?: Store) {}
  readonly kind = "fixture" as const;
  private readonly sessions = new Map<string, StoredCheckout>();

  reset(): void {
    this.sessions.clear();
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    if (!Number.isInteger(input.amountUsd) || input.amountUsd < 1) {
      throw new Error("bid_not_whole");
    }
    const sessionId = `fix_${randomUUID()}`;
    const intentId = input.intentId ?? `fix_intent_${randomUUID()}`;
    const checkoutUrl = `/checkout/complete?intent=${encodeURIComponent(intentId)}`;
    this.sessions.set(sessionId, {
      sessionId,
      status: "open",
      checkoutUrl,
      listingDraft: { ...input.listingDraft },
      amountUsd: input.amountUsd,
      kind: input.kind,
      intentId,
      metadata: input.metadata,
    });
    return {
      checkoutUrl,
      sessionId,
      providerCheckoutId: sessionId,
      intentId,
    };
  }

  getCheckout(sessionId: string): CheckoutRecord | undefined {
    const session = this.sessions.get(sessionId) ?? this.hydrateSession(sessionId);
    return session ? { ...session, listingDraft: { ...session.listingDraft } } : undefined;
  }

  async completeCheckout(sessionId: string): Promise<PaidEvent> {
    const session = this.requireSession(sessionId);
    if (session.status === "abandoned") throw new Error("payment_incomplete");
    if (session.status !== "paid") {
      session.status = "paid";
      session.paidAt = nowUtc().toISOString();
    }
    return paidEvent(session);
  }

  async abandonCheckout(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId) ?? this.hydrateSession(sessionId);
    if (!session) {
      try {
        (this.durable ?? getStore()).abandonCheckoutIntent(sessionId);
      } catch {
        /* Standalone fixture callers may not have a durable intent. */
      }
      return;
    }
    if (session.status !== "open") return;
    session.status = "abandoned";
    try {
      (this.durable ?? getStore()).abandonCheckoutIntent(session.intentId ?? sessionId);
    } catch {
      /* Standalone fixture tests may not have a matching durable intent. */
    }
  }

  async handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    const event = parseJson(rawBody);
    if (!isRecord(event)) return { ignored: true, reason: "invalid_fixture_event" };
    const data = isRecord(event.data) ? event.data : event;
    const sessionId = stringValue(data.checkoutId) ?? stringValue(data.sessionId) ?? stringValue(data.id);
    if (!sessionId) return { ignored: true, reason: "unknown_checkout" };
    const session = this.sessions.get(sessionId) ?? this.hydrateSession(sessionId);
    if (!session) return { ignored: true, reason: "unknown_checkout" };
    const status = stringValue(data.status) ?? "";
    if (status === "expired" || status === "failed" || status === "canceled" || status === "abandoned") {
      await this.abandonCheckout(sessionId);
      /* Route-created fixture sessions have a durable local intent. Keep the
         intent for audit/recovery while removing it from the unpaid board. */
      return { ignored: true, reason: "checkout_not_paid", intentId: session.intentId, providerCheckoutId: sessionId };
    }
    if (event.type !== "order.completed" && !isPaidStatus(status)) {
      return { ignored: true, reason: "unsupported_event_type", intentId: session.intentId, providerCheckoutId: sessionId };
    }
    const suppliedMetadata = isRecord(data.metadata) ? recordStrings(data.metadata) : undefined;
    if (suppliedMetadata && session.metadata && stableMetadata(suppliedMetadata) !== stableMetadata(session.metadata)) {
      throw new Error("metadata_mismatch");
    }
    session.status = "paid";
    session.paidAt = stringValue(data.timestamp) ?? nowUtc().toISOString();
    const providerEventId = stringValue(data.eventId) ?? header(headers, "x-waffo-event-id");
    const providerDeliveryId = header(headers, "x-waffo-delivery-id") ?? header(headers, "webhook-id");
    return {
      ...paidEvent(session),
      providerEventType: event.type === "order.completed" ? "order.completed" : "fixture.checkout.completed",
      providerEventId,
      providerDeliveryId,
      providerPaymentId: stringValue(data.paymentId),
      providerOrderId: stringValue(data.orderId),
      providerCheckoutId: sessionId,
      currency: "USD",
      amountCents: usdToCents(session.amountUsd),
      metadata: session.metadata,
    };
  }

  private requireSession(sessionId: string): StoredCheckout {
    const session = this.sessions.get(sessionId) ?? this.hydrateSession(sessionId);
    if (!session) throw new Error("payment_incomplete");
    return session;
  }

  /** Rebuild the fixture cache from the durable intent after a process restart. */
  private hydrateSession(sessionId: string): StoredCheckout | undefined {
    let intent;
    try {
      const store = this.durable ?? getStore();
      intent = store.findCheckoutIntentByProviderCheckoutId(sessionId) ??
        store.getCheckoutIntent(sessionId);
    } catch {
      return undefined;
    }
    if (!intent) return undefined;
    const providerSessionId = intent.providerCheckoutId ?? intent.intentId;
    const session: StoredCheckout = {
      sessionId: providerSessionId,
      status: intent.lifecycle === "paid" ? "paid" : intent.lifecycle === "abandoned" ? "abandoned" : "open",
      checkoutUrl: intent.checkoutUrl ?? `/checkout/complete?intent=${encodeURIComponent(intent.intentId)}`,
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
    };
    this.sessions.set(providerSessionId, session);
    this.sessions.set(intent.intentId, session);
    return session;
  }
}

let sharedFixture: FixturePayment | undefined;

export function getFixturePayment(): FixturePayment {
  if (!sharedFixture) sharedFixture = new FixturePayment();
  return sharedFixture;
}

function paidEvent(session: StoredCheckout): PaidEvent {
  return {
    sessionId: session.sessionId,
    intentId: session.intentId,
    listingDraft: { ...session.listingDraft },
    amountUsd: session.amountUsd,
    amountCents: usdToCents(session.amountUsd),
    kind: session.kind,
    paidAt: session.paidAt ?? nowUtc().toISOString(),
    providerCheckoutId: session.sessionId,
    currency: "USD",
    metadata: session.metadata,
  };
}

function stableMetadata(metadata: Record<string, string>): string {
  return JSON.stringify(Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b)));
}

function isPaidStatus(status: string): boolean {
  return status === "succeeded" || status === "paid" || status === "confirmed" || status === "complete";
}

function parseJson(rawBody: string): unknown {
  try { return JSON.parse(rawBody) as unknown; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordStrings(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string") as Array<[string, string]>);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === wanted && value.trim()) return value.trim();
  return undefined;
}
