import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST as postCheckout } from "../src/app/api/checkout/route";
import {
  CheckoutError,
  parseListingDraft,
  resetPaymentPort,
} from "../src/billing/port";
import {
  ListingError,
  canonicalListenUrl,
  listingListenKey,
} from "../src/core/listing";
import { getBoardListings } from "../src/core/rank";
import { resetListings } from "../src/core/store";
import {
  canonicalizeListenUrl,
  isTrackingQueryKey,
  UrlError,
} from "../src/core/url";
import { currentWeekUtc } from "../src/core/week";

process.env.WEEK_NOW ??= "2026-08-20T12:00:00.000Z";

afterEach(() => {
  resetListings();
  resetPaymentPort();
});

function weekId(): string {
  return currentWeekUtc().weekId;
}

async function postJson(payload: Record<string, unknown>): Promise<Response> {
  return postCheckout(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

test("raise identity key is the canonical listen URL, not weekId", () => {
  assert.equal(
    listingListenKey("https://example.com/cold-open?utm_source=x"),
    "https://example.com/cold-open",
  );
  assert.doesNotMatch(
    listingListenKey("https://example.com/cold-open"),
    /2026-W/,
  );
});

test("listing requires track, artist, and listen URL", () => {
  assert.throws(
    () => parseListingDraft({ artist: "Ada", listenUrl: "https://example.com/t" }, weekId()),
    (err: unknown) => {
      assert.ok(err instanceof CheckoutError);
      assert.equal(err.code, "invalid_listing");
      return true;
    },
  );
  assert.throws(
    () => parseListingDraft({ track: "Cold Open", listenUrl: "https://example.com/t" }, weekId()),
    (err: unknown) => {
      assert.ok(err instanceof CheckoutError);
      assert.equal(err.code, "invalid_listing");
      return true;
    },
  );
  assert.throws(
    () => parseListingDraft({ track: "Cold Open", artist: "Ada" }, weekId()),
    (err: unknown) => {
      assert.ok(err instanceof CheckoutError);
      assert.equal(err.code, "url_insecure");
      return true;
    },
  );
  const draft = parseListingDraft(
    {
      track: " Cold Open ",
      artist: " Ada ",
      listenUrl: "https://example.com/cold-open",
    },
    weekId(),
  );
  assert.equal(draft.track, "Cold Open");
  assert.equal(draft.artist, "Ada");
  assert.equal(draft.listenUrl, "https://example.com/cold-open");
});

test("play-count field is play_count_forbidden", () => {
  for (const extra of [
    { playCount: 1200000 },
    { play_count: "99" },
    { plays: 10 },
    { streams: "1.2M" },
    { monthlyListeners: 4000 },
    { views: 88 },
  ]) {
    assert.throws(
      () =>
        parseListingDraft(
          {
            track: "Cold Open",
            artist: "Ada",
            listenUrl: "https://example.com/cold-open",
            ...extra,
          },
          weekId(),
        ),
      (err: unknown) => {
        assert.ok(err instanceof CheckoutError);
        assert.equal(err.code, "play_count_forbidden");
        return true;
      },
    );
  }
});

test("utm_source and tracking keys are stripped from the stored listen URL", () => {
  assert.equal(isTrackingQueryKey("utm_source"), true);
  assert.equal(isTrackingQueryKey("utm_campaign"), true);
  assert.equal(isTrackingQueryKey("fbclid"), true);
  assert.equal(isTrackingQueryKey("ref_src"), true);
  assert.equal(isTrackingQueryKey("keep"), false);

  const stripped = canonicalizeListenUrl(
    "https://Music.Example/track?utm_source=x&utm_campaign=launch&fbclid=1&gclid=2&gbraid=3&wbraid=4&msclkid=5&ref=ad&ref_src=tw&affiliate=1&aff=2&irclickid=9&mc_cid=a&mc_eid=b&icid=c&si=d&igshid=e&keep=yes#frag",
  );
  assert.equal(stripped, "https://music.example/track?keep=yes");
  assert.doesNotMatch(stripped, /utm_/);
  assert.doesNotMatch(stripped, /fbclid/);
  assert.doesNotMatch(stripped, /#/);

  const draft = parseListingDraft(
    {
      track: "Cold Open",
      artist: "Ada",
      listenUrl:
        "https://example.com/cold-open?utm_source=board&fbclid=abc#player",
    },
    weekId(),
  );
  assert.equal(draft.listenUrl, "https://example.com/cold-open");
  assert.equal(
    canonicalListenUrl("https://example.com/cold-open?utm_source=x"),
    "https://example.com/cold-open",
  );
});

test("telegram invite is url_forbidden", () => {
  for (const listenUrl of [
    "https://t.me/foo",
    "https://telegram.me/invite",
    "https://wa.me/15555550100",
    "https://chat.whatsapp.com/invite",
    "https://discord.gg/abc",
    "https://discord.com/invite/abc",
    "https://m.me/page",
    "https://signal.me/#p/+15555550100",
  ]) {
    assert.throws(() => canonicalizeListenUrl(listenUrl), (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.equal(err.code, "url_forbidden");
      return true;
    });
    assert.throws(
      () => canonicalListenUrl(listenUrl),
      (err: unknown) => {
        assert.ok(err instanceof ListingError);
        assert.equal(err.code, "url_forbidden");
        return true;
      },
    );
  }
});

test("NSFW listen URL is url_forbidden", () => {
  for (const listenUrl of [
    "https://pornhub.com/view",
    "https://onlyfans.com/user",
    "https://example.com/nsfw/track",
    "https://example.com/xxx",
  ]) {
    assert.throws(() => canonicalizeListenUrl(listenUrl), (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.equal(err.code, "url_forbidden");
      return true;
    });
  }
});

test("http, javascript, data, shortener, and localhost are rejected", () => {
  assert.throws(() => canonicalizeListenUrl("http://example.com/insecure"), (err: unknown) => {
    assert.ok(err instanceof UrlError);
    assert.equal(err.code, "url_insecure");
    return true;
  });
  for (const listenUrl of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://bit.ly/abc",
    "https://t.co/abc",
    "https://tinyurl.com/abc",
    "https://lnkd.in/abc",
    "https://localhost/track",
    "https://127.0.0.1/track",
    "https://user:pass@example.com/track",
  ]) {
    assert.throws(() => canonicalizeListenUrl(listenUrl), (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.ok(err.code === "url_insecure" || err.code === "url_forbidden");
      return true;
    });
  }
});

test("checkout rejects chat, NSFW, and invented play counts without listing", async () => {
  const chat = await postJson({
    track: "Invite",
    artist: "Ada",
    listenUrl: "https://t.me/foo",
    amountUsd: 5,
  });
  assert.equal(chat.status, 400);
  assert.deepEqual(await chat.json(), { error: "url_forbidden" });

  const nsfw = await postJson({
    track: "Adult",
    artist: "Ada",
    listenUrl: "https://pornhub.com/view",
    amountUsd: 5,
  });
  assert.equal(nsfw.status, 400);
  assert.deepEqual(await nsfw.json(), { error: "url_forbidden" });

  const plays = await postJson({
    track: "Counted",
    artist: "Ada",
    listenUrl: "https://example.com/counted",
    amountUsd: 5,
    playCount: 1_200_000,
  });
  assert.equal(plays.status, 400);
  assert.deepEqual(await plays.json(), { error: "play_count_forbidden" });
  assert.equal(getBoardListings().length, 0);
});
