import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  CheckoutError,
  getPaymentPort,
  parseListingDraft,
} from "../../../billing/port";
import { ListingError, parseTargetBidUsd, quoteBid } from "../../../core/listing";
import {
  attachCheckoutIntent,
  createCheckoutIntent,
  findPaidByListenUrl,
  getStore,
} from "../../../core/store";
import { currentWeekUtc } from "../../../core/week";
import { waffoMode } from "../../../config";
import {
  CLAIMANT_COOKIE,
  claimantFromCookieHeader,
  claimantTokenHash,
  createClaimantToken,
} from "../../../core/claimant";
import { isProductionLike } from "../../../config";

function formRecord(form: FormData): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") record[key] = value;
  }
  return record;
}

function jsonError(code: string, status: number): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

function withClaimantCookie(
  response: NextResponse,
  token: string | undefined,
  request: Request,
): NextResponse {
  if (!token) return response;
  response.cookies.set({
    name: CLAIMANT_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:" || isProductionLike(),
    path: "/",
    maxAge: 31_536_000,
  });
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  let body: Record<string, unknown>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const parsed: unknown = await request.json();
      body =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
    } else {
      body = formRecord(await request.formData());
    }
  } catch {
    return jsonError("invalid_listing", 400);
  }

  try {
    const weekId = currentWeekUtc().weekId;
    const targetBidUsd = parseTargetBidUsd(body.amountUsd ?? body.bidUsd);
    const listingDraft = parseListingDraft(body, weekId);
    const existing = findPaidByListenUrl(listingDraft.listenUrl);
    const providedClaimantHash = claimantFromCookieHeader(request.headers.get("cookie"));
    const incumbentClaimantHash = existing
      ? getStore().claimantHashForListing(existing.id)
      : undefined;
    if (existing && !incumbentClaimantHash) {
      /* A listing written before claimant ownership was introduced cannot be
         safely assigned to a new browser. Do not quote or call Waffo for a
         legacy incumbent; an operator must reconcile/claim it explicitly. */
      throw new CheckoutError("not_owner", 409);
    }
    if (existing && incumbentClaimantHash && !getStore().isListingClaimant(existing.id, providedClaimantHash)) {
      throw new CheckoutError("not_owner", 409);
    }
    if (existing && incumbentClaimantHash &&
        (existing.track !== listingDraft.track || existing.artist !== listingDraft.artist)) {
      throw new CheckoutError("identity_facts_mismatch", 409);
    }
    const claimantToken = providedClaimantHash
      ? undefined
      : createClaimantToken();
    const claimantHash = incumbentClaimantHash
      ? providedClaimantHash
      : providedClaimantHash ?? claimantTokenHash(claimantToken);
    if (!claimantHash) throw new CheckoutError("claimant_required", 409);
    const quote = quoteBid(existing, targetBidUsd);
    const mode = waffoMode();
    const intentId = `intent_${randomUUID()}`;
    const intent = createCheckoutIntent({
      intentId,
      listingDraft,
      kind: quote.kind,
      currentBidCents: (existing?.bidUsd ?? 0) * 100,
      targetBidCents: targetBidUsd * 100,
      chargeCents: quote.chargeUsd * 100,
      currency: "USD",
      productId: mode === "fixture" ? "fixture-product" : process.env.WAFFO_PRODUCT_ID?.trim() ?? "",
      mode,
      taxCategory: "digital_goods",
      claimantTokenHash: claimantHash,
    });
    let started;
    try {
      started = await getPaymentPort().createCheckout({
        listingDraft,
        amountUsd: quote.chargeUsd,
        amountCents: quote.chargeUsd * 100,
        kind: quote.kind,
        intentId,
        metadata: intent.metadata,
      });
      attachCheckoutIntent({
        intentId,
        providerCheckoutId: started.providerCheckoutId ?? started.sessionId,
        checkoutUrl: started.checkoutUrl,
        expiresAt: started.expiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "waffo_ambiguous";
      /* The adapter records its durable outcome before throwing. Only the
         pre-network `creating` state belongs to this route; a late route
         failure must not downgrade an intent that is already open, paid, or
         awaiting reconciliation. The store CAS is the final race guard. */
      const current = getStore().getCheckoutIntent(intentId);
      if (current?.lifecycle === "creating") {
        getStore().markCheckoutIntent(
          intentId,
          message === "waffo_ambiguous" ? "unknown" : "rejected",
          message,
        );
      }
      throw error;
    }
    if (contentType.includes("application/json")) {
      return withClaimantCookie(NextResponse.json({
        checkoutUrl: started.checkoutUrl,
        sessionId: started.sessionId,
        intentId,
      }), claimantToken, request);
    }
    const location = started.checkoutUrl.startsWith("http")
      ? started.checkoutUrl
      : `${origin}${started.checkoutUrl}`;
    return withClaimantCookie(NextResponse.redirect(location, 303), claimantToken, request);
  } catch (error) {
    if (error instanceof CheckoutError || error instanceof ListingError) {
      if (contentType.includes("application/json")) {
        return jsonError(error.code, error.httpStatus);
      }
      const back = new URL("/", origin);
      back.searchParams.set("error", error.code);
      return NextResponse.redirect(back, 303);
    }
    const message = error instanceof Error ? error.message : "";
    if (
      message === "waffo_ambiguous" ||
      message === "waffo_rejected" ||
      message === "intent_rejected" ||
      message === "checkout_abandoned" ||
      message === "payment_already_settled" ||
      message === "reconciliation_required" ||
      message === "product_required" ||
      message.startsWith("BLOCKED-CONFIG") ||
      message.startsWith("BLOCKED-SECRET")
    ) {
      return jsonError(
        message === "waffo_rejected" || message === "intent_rejected"
          ? "payment_rejected"
          : "payment_unavailable",
        message === "reconciliation_required" || message === "payment_already_settled" ? 409 : 503,
      );
    }
    throw error;
  }
}
