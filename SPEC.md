# Playlist Headline — Product Development Spec

**Version:** 1.0
**Status:** Ready to build
**Repo:** https://github.com/tangpingqingwa/09-playlist-headline
**Market:** global English
**Currency:** USD only
**Clone of:** [outbid.lol](https://outbid.lol/) pay-to-rank mechanics
**Forbidden:** invented play counts, fake streams, chat/invite links, NSFW, live Polar in CI

This document is the product contract. If README and SPEC disagree, SPEC wins until README is updated. If SPEC and code disagree, fix one of them in the same PR.

Implementation plan (stack, modules, PR DAG): [BUILD.md](./BUILD.md).

---

## 1. Product statement

A weekly public auction for the **first track / opening song** on a **real** playlist or live radio. Artists, labels, and promoters bid whole US dollars so listeners hear their song first.

Rank is the bid. Nothing else. The winner is actually played first. Playback must be real. There are no fake streams and no invented play counts.

One-line pitch: **Bid USD. Open the week. Listeners hear you first.**

---

## 2. Goals and non-goals

### Goals

- Public leaderboard. Anyone can read the board without an account.
- No ads, no API keys, no revenue share with listed tracks.
- Whole-dollar USD bids. Minimum **$5**. Increments of **$1**.
- Rank = current bid. Paying less than #1 still lists at the rank that bid can take.
- Equal bids: the **older** listing keeps the higher rank.
- Same listing can raise; **raise pays difference** only.
- Listing is **track + artist + listen URL**.
- **Weekly reset UTC.** Live board is the rolling last 7 days from first paid placement. Not Monday 00:00 UTC.
- **Playback must be real.** The listen URL is a real https destination. No fake streams.
- **No invented play counts.** Do not scrape or display Spotify monthly listeners, YouTube views, SoundCloud plays, or any other platform stat.
- Strip tracking and affiliate query strings from the listen URL.
- Reject chat / invite links and NSFW.
- Public click counts on the listen URL (clicks, not plays).
- Live payments via Polar (merchant of record). Tests use a Polar **fixture**.
- Pages: board, about, rules, checkout return.

### Non-goals

- A fake radio station, generated audio, or a silent waveform that pretends to play.
- Invented play counts, “1.2M streams”, monthly listeners, or review stars.
- Hosting the master audio file. We link / embed the bidder’s real listen URL.
- Chat, DMs, comments, or accounts-as-social-graph.
- Multi-currency. USD only in v1.
- China-city default. Global English market.
- Editorial picks that override money. Rank is the bid.
- Ads, affiliate networks, or revenue share with Spotify / Apple / radio.

### Kill / change rules

- If after 90 days nobody will bid because the playlist/radio is not actually playing #1 first, freeze features. Do not invent a stream to “fix” an empty week.
- Polar down → checkout fails closed. Do not invent a paid opening track.

---

## 3. Users

| Persona | Need |
|---|---|
| Artist / label / promoter | Put a real track first this week so listeners hear it first |
| Listener | Hear the real opening song; click through to the real listen URL |
| Spectator | Watch who is paying. No login. |

There is no logged-in member. Payment is the only write path.

---

## 4. The slot

The rolling last-7-days window has one open **headline slot**: the first track / opening song on the operator’s real playlist or live radio.

- #1 in this window is the opening song. The operator plays that paid listing first.
- Paying less than #1 still lists on the public board, at the rank that bid can take. Those tracks are not the opening song.
- After seven days from first paid placement, that bid is gone from the live board. Want the next open? Pay again. Monday 00:00 UTC is **not** the expiry.
- An empty window is valid. There is **no** opening song until someone pays. Do not invent a track.

v1 is one public board. Do not fork ranking per station. A later station/playlist row must reuse the same rank function.

---

## 5. Listing schema (normative)

A listing is created only after Polar (or the fixture checkout) reports a completed payment.

```ts
type Listing = {
  id: string
  weekId: string            // ISO week label in UTC, e.g. "2026-W34"; not live expiry
  track: string             // 1–80 chars, trimmed
  artist: string            // 1–80 chars, trimmed
  listenUrl: string         // https, tracking stripped; real playback target
  bidUsd: number            // integer >= 5
  firstPaidAt: string       // ISO instant of first successful payment (tie-break)
  lastPaidAt: string
  clicks: number            // public listen-URL clicks; never a platform play count
}
```

**Required to place:** `track`, `artist`, `listenUrl`, `bidUsd`.

**Identity for raise:** canonical `listenUrl` still inside the rolling last 7 days from first paid placement. Same key → raise. Different key → new listing that must pay the full bid. `weekId` stays a Polar/audit label — not raise identity. An artist who paid Sunday still raises on Monday if that listen URL is inside last 7 days. After the window ends, the same URL is a new listing (full bid), not a raise.

**Forbidden on the card, in the player, and in the database:**

- Play counts, stream counts, monthly listeners, view counts, “trending”, star ratings.
- Fake or generated audio. Silent / looped placeholder “streams.”
- Tracking query strings on the outbound listen URL.
- Chat / invite URLs. NSFW copy or listen URLs.

The board may show: rank, track, artist, **$bid**, public **clicks**, listen CTA / real player. It may not show play counts.

---

## 6. Ranking rules (normative)

Clone of outbid.lol. Rank is the bid. Nothing else.

| Rule | Detail |
|---|---|
| Currency | USD |
| Amount | Whole dollars only. Reject cents. |
| Minimum | **$5** on a first bid for a listing in this week |
| Rank | Descending `bidUsd`. **rank = bid** |
| Below #1 | Still lists, at the rank that amount can take |
| Ties | **Older wins ties.** Compare `firstPaidAt` ascending, then listing id |
| Raise | Same listen URL still inside last 7 days may raise. `weekId` is not the raise key. Charge **new − current** only |
| Steal | A *different* listing that wants that rank must pay the **full** target amount, not the incumbent’s difference |
| Floor after raise | New amount must be a whole dollar ≥ current + $1 and ≥ $5 |
| Claim | A **completed payment** claims the rank. Unpaid checkout does not |
| Period | Rankings are computed only among listings whose `firstPaidAt` is in the **rolling last 7 days** |

Display order: `bidUsd DESC`, then `firstPaidAt ASC` (older wins ties), then `id ASC`.

There is no recency boost, editorial override, play-count score, or “quality” rank in v1.

Worked examples, same week:

1. Empty board. A bids $5 → A is #1 (opening song) at $5.
2. B bids $12 → B is #1, A is #2.
3. Two $12 bids → older `firstPaidAt` stays above.
4. A raises to $15 and pays **$10** difference → A is #1, B is #2. `firstPaidAt` unchanged.
5. C tries to pay only A’s $10 difference → rejected / not a raise. C must pay a full new bid.

---

## 7. Weekly reset (normative)

| Field | Value |
|---|---|
| Period | 7 days from first paid placement |
| Boundary | Rolling last 7 days. **Not** Monday 00:00:00.000 UTC |
| `weekId` | ISO week in UTC, `YYYY-Www` (e.g. `2026-W34`). Polar/audit label only |
| What resets | Live rank after seven days from `firstPaidAt`. Clicks and bids do not carry once that window ends |
| What does not carry | Previous window bid amounts. Want the next open? Pay again. |
| History | Aged rows may stay readable as archive. They are not the live opening song. |
| Empty week | Valid. No invented opening track. Empty copy names last 7 days, not Monday midnight UTC. |

The occupied board names the rolling last-7-days window. Occupied Hear and later tracks name last 7 days, not this calendar week. Empty station copy names the same fair window without occupied rolling chrome. Monday 00:00 UTC remains the ISO `weekId` label, not the public expiry. Not a 24h lock on #1.

Do not carry bids after seven days. A listen URL that aged out of the window is a **new** listing and pays a full bid ≥ $5.

---

## 8. Real playback (normative)

Listeners must be able to hear the winner. Playback is not decorative.

1. The listen URL is a real `https` page or stream the bidder controls (Spotify, Apple Music, YouTube / YouTube Music, SoundCloud, Bandcamp, Mixcloud, an official radio stream, or the artist’s own site).
2. The board’s listen control **302**s to that stored URL, or embeds it through a documented official embed for that host. Both are real playback. A silent custom player that does not load the listing’s URL is a **fake stream** and is forbidden.
3. If the week has no paid #1, there is no player and no opening song. Honest empty state.
4. Never invent, generate, or loop audio to fill the slot.
5. Never display a play count, stream count, or listener count from any platform. Public **clicks** on our listen hop are the only counter.

Clicks are not plays. Do not label the public click integer as “plays” or “streams.”

---

## 9. URL hygiene

On create and raise, normalize `listenUrl`:

1. Require `https:` (http → reject `url_insecure`).
2. Strip tracking / affiliate query keys: `utm_*`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `msclkid`, `ref`, `ref_`, `affiliate`, `aff`, `irclickid`, `mc_cid`, `mc_eid`, `icid`, `si`, `igshid`.
3. Strip fragments.
4. Reject chat / invite hosts (telegram, t.me, wa.me, chat.whatsapp, discord.gg, discord.com/invite, m.me, signal.me).
5. Reject obvious NSFW path tokens and adult hosts (document the list in code; keep it boring).
6. Reject `javascript:`, `data:`, credentials-in-URL, and localhost / link-local hosts.
7. Known shorteners (`bit.ly`, `t.co`, `tinyurl.com`, `lnkd.in`) are not stored. Resolve one hop in live or reject.

Store and display only the stripped URL. Public clicks count on that stored URL. The player / embed uses that same URL.

---

## 10. Payments

`PaymentPort`:

```ts
createCheckout(input: {
  listingDraft: ListingDraft
  amountUsd: number          // full first bid, or raise difference
  kind: "create" | "raise"
}): Promise<{ checkoutUrl: string; sessionId: string }>

handleWebhook(rawBody: string, headers: Record<string, string>): Promise<PaidEvent>
```

| Mode | When | Behavior |
|---|---|---|
| Fixture | tests, `POLAR_FIXTURE_ONLY=1`, or Polar unset | In-memory / signed fixture session. No network |
| Live Polar | `POLAR_LIVE=1` + Polar secrets | Polar checkout + webhook. Merchant of record |

`POLAR_FIXTURE_ONLY=1` always wins. Unset / `0` / `true` stay fixture or fail-closed. CI must not set `POLAR_LIVE=1`.

Rank updates **only** after a successful paid event. Abandoned checkout does not create or raise a listing. Do not invent a paid opening track.

---

## 11. Pages

```
GET  /                         public board for the rolling last 7 days + bid form
POST /checkout                 { track, artist, listenUrl, amountUsd }
                               → PaymentPort.createCheckout (create or raise)
GET  /return                   checkout return; show paid / pending, never trust query alone
GET  /click/:id                302 listenUrl; increment public clicks
GET  /about                    what this is; rank is money; real playback; no play counts
GET  /rules                    min $5, ties, raise = difference, rolling last 7 days, no NSFW, no fake streams
GET  /healthz                  { ok: true }
```

Board UI (clone outbid.lol, not a redesign):

- Fields: track, artist, listen URL, whole-dollar amount, one **Outbid** button.
- Ranked cards: rank, track, artist, **$amount**, public **clicks**, listen control.
- #1 may expose a real player / embed for that listing’s listen URL.
- No play-count widgets. No star ratings. No fake waveform.

---

## 12. Errors

| Code | HTTP | When |
|---|---|---|
| `bid_not_whole` | 400 | cents or non-integer |
| `bid_below_min` | 400 | first bid &lt; $5 |
| `bid_not_higher` | 400 | raise ≤ current |
| `url_insecure` | 400 | not https |
| `url_forbidden` | 400 | chat / NSFW / shortener / unusable host |
| `week_closed` | 400 | bid outside the rolling last-7-days window |
| `play_count_forbidden` | 400 | submit tried to attach a play/stream/listener count |
| `payment_incomplete` | 402 | checkout abandoned; board unchanged |
| `polar_unavailable` | 503 | live Polar down; fixture never invents a paid event |

Zero invented listings on any error. Zero invented play counts.

---

## 13. Acceptance

| # | Case | Expected |
|---|---|---|
| 1 | Empty week | 200, zero cards, bid form visible, no opening song, no invented play count |
| 2 | First bid $5 fixture | listing appears; rank 1; `$5`; clicks 0 |
| 3 | Second listing $8 | new listing #1; $5 listing #2 |
| 4 | Two $8 bids | older listing stays above |
| 5 | #2 raises to $12 | pays **$7** difference; becomes #1; `firstPaidAt` unchanged |
| 6 | Tracking query on listen URL | stored URL has tracking stripped |
| 7 | Chat invite URL | `url_forbidden`; no listing |
| 8 | NSFW listen URL | `url_forbidden`; no listing |
| 9 | Click listen CTA | 302 to stripped URL; public clicks +1; not labeled as plays |
| 10 | Real playback | listen control / embed uses the stored listen URL; no fake stream |
| 11 | After Monday 00:00 UTC | a bid still inside 7 days stays ranked; a bid paid 7 days ago is unranked |
| 12 | `POLAR_LIVE` unset | fixture / fail-closed; no Polar network |

---

## 14. Live-smoke flows

Operator-only. `scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or Actions.

Local process, `POLAR_LIVE=1` if Polar secrets exist, else record `BLOCKED-SECRET` for checkout only. Board, rules, about, and click still run.

| Flow | Pass |
|---|---|
| Board | 200, rolling last 7 days, no invented play counts, no fake stream |
| About / rules | 200, state min $5, older wins ties, raise pays difference, rolling last 7 days (not Monday 00:00 UTC), no fake streams |
| Create checkout | Polar session for a real https listen URL **or** `BLOCKED-SECRET` (`POLAR_ACCESS_TOKEN`) |
| Click | 302, click count increments (fixture listing allowed if live pay is blocked) |
| Playback | listen control hits the stored URL; not a generated file |

Missing Polar secret is not a license to invent a paid opening track.

---

## 15. Layout

```
/
  SPEC.md
  BUILD.md
  README.md
  CONTRIBUTING.md
  scripts/test.sh
  .github/workflows/ci.yml
```

Application tree is defined in [BUILD.md](./BUILD.md). This unit does not add app code.

---

## 16. Git collaboration (normative)

Development is GitHub trunk-based. **`main` is always cloneable, buildable, and testable.**

| Rule | Requirement |
|---|---|
| Integration branch | `main` only. No long-lived `develop`. |
| How code lands | Pull request into `main`. No direct push. |
| Required check | GitHub Actions workflow `ci` (job id `ci`) must be green. |
| Local / CI test | `bash scripts/test.sh` — offline, no production secrets. |
| Branch names | `feat/` `fix/` `docs/` `chore/` `test/` + short slug. |
| Merge | Squash. Delete the head branch. |
| Broken `main` | Treat as an incident. Fix on `fix/…` via PR. |

Full process: [CONTRIBUTING.md](./CONTRIBUTING.md).

Until there is an application binary, `scripts/test.sh` still has to pass: contract files exist, SPEC/CONTRIBUTING agree, no tracked secrets. Adding a server means **extending** that script with unit/contract tests. Live Polar calls are optional and must not be required for `main` to stay green.
