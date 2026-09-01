import { NextResponse } from "next/server";
import { getPaymentPort, type PaidEvent, type WebhookResult } from "../../../../billing/port";
import { applyPaidEvent, StoreApplyError } from "../../../../core/store";

function headerMap(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key] = value; });
  return out;
}

function applyVerified(result: WebhookResult): boolean {
  if ("ignored" in result) return false;
  const paid: PaidEvent = result;
  applyPaidEvent({
    sessionId: paid.sessionId,
    intentId: paid.intentId,
    weekId: paid.listingDraft.weekId,
    track: paid.listingDraft.track,
    artist: paid.listingDraft.artist,
    listenUrl: paid.listingDraft.listenUrl,
    amountUsd: paid.amountUsd,
    amountCents: paid.amountCents,
    paidAt: paid.paidAt,
    kind: paid.kind,
    productId: paid.productId,
    currency: paid.currency,
    metadata: paid.metadata,
    metadataFingerprint: paid.metadataFingerprint,
    providerCheckoutId: paid.providerCheckoutId,
    providerDeliveryId: paid.providerDeliveryId,
    providerEventId: paid.providerEventId,
    providerPaymentId: paid.providerPaymentId,
    providerOrderId: paid.providerOrderId,
    providerEventType: paid.providerEventType,
    rawBodyHash: paid.rawBodyHash,
    eventFingerprint: paid.eventFingerprint,
  });
  return true;
}

/** Canonical Waffo settlement boundary. The raw body stays opaque until SDK verification. */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  try {
    const result = await getPaymentPort().handleWebhook(
      rawBody,
      headerMap(request.headers),
    );
    return NextResponse.json({
      received: true,
      applied: applyVerified(result),
      ...("ignored" in result && result.reason ? { reason: result.reason } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid webhook";
    if (error instanceof StoreApplyError && error.replayed) {
      return NextResponse.json({
        received: true,
        applied: false,
        reason: message === "event_reuse_mismatch" ? "rejected" : "reconciliation_required",
      });
    }
    if (
      message === "reconciliation_required" ||
      message === "stale_raise" ||
      message === "not_owner" ||
      message === "identity_facts_mismatch" ||
      message === "identity_taken" ||
      message === "raise_target_missing" ||
      message === "captured_timestamp_out_of_window" ||
      message === "captured_timestamp_before_intent" ||
      message === "captured_timestamp_after_receipt" ||
      message === "payment_identity_reuse" ||
      message === "checkout_identity_reuse"
    ) {
      return NextResponse.json(
        { received: true, applied: false, error: "reconciliation_required" },
        { status: 409 },
      );
    }
    if (
      message === "unknown_intent" ||
      message === "unknown_checkout" ||
      message === "payment_incomplete"
    ) {
      return NextResponse.json({ received: true, applied: false, error: message }, { status: 400 });
    }
    const status = message.includes("signature") ||
      message.includes("mismatch") ||
      message.startsWith("metadata_") ||
      message.startsWith("amount_") ||
      message.startsWith("currency_") ||
      message.startsWith("mode_") ||
      message.startsWith("store_") ||
      message.startsWith("order_") ||
      message.startsWith("payment_") ||
      message.startsWith("product_") ||
      message.startsWith("tax_") ||
      message.startsWith("intent_") ||
      message.startsWith("checkout_") ||
      message.startsWith("event_") ||
      message.endsWith("_id_missing")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
