import { NextResponse } from "next/server";

/** Compatibility tombstone: only the canonical Waffo route settles payments. */
export function POST(_request?: Request): Response {
  return NextResponse.json({ error: "waffo_webhook_required" }, { status: 410 });
}
