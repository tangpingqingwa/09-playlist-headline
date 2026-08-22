import { NextResponse } from "next/server";
import { getPaymentPort, type WebhookResult } from "../../../../billing/port";
import { applyPaidEvent } from "../../../../core/store";

export const POLAR_WEBHOOK_PATH = "/api/polar/webhook" as const;

function headerMap(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function applyIfPaid(result: WebhookResult): boolean {
  if ("ignored" in result) return false;
  applyPaidEvent({
    sessionId: result.sessionId,
    weekId: result.listingDraft.weekId,
    track: result.listingDraft.track,
    artist: result.listingDraft.artist,
    listenUrl: result.listingDraft.listenUrl,
    amountUsd: result.amountUsd,
    paidAt: result.paidAt,
  });
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  try {
    const result = await getPaymentPort().handleWebhook(rawBody, headerMap(request.headers));
    return NextResponse.json({ received: true, applied: applyIfPaid(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid webhook";
    const status =
      message.startsWith("BLOCKED-SECRET") || message.includes("signature") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
