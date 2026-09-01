import { NextResponse } from "next/server";
import { incrementListingClicks } from "../../../core/store";

type ClickContext = {
  params: Promise<{ id: string }>;
};

/** Public listen hop. Clicks are not plays. */
export async function GET(
  _request: Request,
  context: ClickContext,
): Promise<Response> {
  const params = await context.params;
  const id = params.id?.trim() ?? "";
  const listing = incrementListingClicks(id);
  if (!listing) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }
  const response = NextResponse.redirect(listing.listenUrl, 302);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
