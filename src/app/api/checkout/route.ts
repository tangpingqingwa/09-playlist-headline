import { NextResponse } from "next/server";
import {
  CheckoutError,
  getPaymentPort,
  parseListingDraft,
} from "../../../billing/port";
import { ListingError, parseTargetBidUsd, quoteBid } from "../../../core/listing";
import { findPaidByListenUrl } from "../../../core/store";
import { currentWeekUtc } from "../../../core/week";

export const CHECKOUT_PATH = "/api/checkout" as const;

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
    const existing = findPaidByListenUrl(weekId, listingDraft.listenUrl);
    const quote = quoteBid(existing, targetBidUsd);
    const started = await getPaymentPort().createCheckout({
      listingDraft,
      amountUsd: quote.chargeUsd,
      kind: quote.kind,
    });
    if (contentType.includes("application/json")) {
      return NextResponse.json({
        checkoutUrl: started.checkoutUrl,
        sessionId: started.sessionId,
      });
    }
    const location = started.checkoutUrl.startsWith("http")
      ? started.checkoutUrl
      : `${origin}${started.checkoutUrl}`;
    return NextResponse.redirect(location, 303);
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
    if (message === "polar_unavailable" || message.startsWith("BLOCKED-SECRET")) {
      return jsonError("polar_unavailable", 503);
    }
    throw error;
  }
}
