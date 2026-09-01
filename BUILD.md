# Playlist Headline — Build and Release Contract

`SPEC.md` defines the radio-desk product and ranking rules. This document
defines the runtime boundary, durable payment ledger, tests, and release gate.
The Waffo Pancake adapter is the only live provider. The old Polar module is a
disabled compatibility tombstone and is not a selectable mode or route.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node 22+, TypeScript strict |
| App | Next.js App Router and Route Handlers |
| DB | SQLite via `better-sqlite3`; `DATABASE_PATH` is explicit in production |
| Payments | `PaymentPort`: `fixture`, `waffo-test`, or `waffo-prod` |
| Provider | `@waffo/pancake-ts@0.19.1`, server-side only |
| Playback | Official embed or redirect to the stored listen URL; never generated audio |
| Tests | `node:test` + `tsx`; no provider network or secrets |
| Process | `next start`; `/healthz` is served by the same process |

## Durable model

The database owns weeks, listings, clicks, checkout intents, checkout events,
and payment events. A checkout intent is immutable after creation: local ID,
provider checkout ID when attached, track, artist, canonical listen URL, week,
kind, current/target/charge cents, USD, product, tax category, metadata
fingerprint, and opaque claimant digest. Provider delivery ID, business event
ID, payment ID, order ID, raw-body hash, normalized event fingerprint, outcome,
and error are distinct ledger identities.

One transaction verifies and records an accepted, rejected, or reconciliation
event together with the intent transition and listing mutation. Exact signed
replays are no-ops. Changed identity or facts are rejected. A stale/future
capture and a second stale `$5 → $12` raise become `needs_reconciliation` and
never create or inflate a listing. `firstPaidAt` is preserved on raises.

Raise identity is the same canonical listen URL still inside that window — not `weekId`.

## Runtime tree

```text
src/
  app/
    page.tsx                         # radio-station desk
    about/page.tsx
    rules/page.tsx
    checkout/complete/page.tsx       # read-only Waffo return surface
    return/page.tsx                  # read-only compatibility surface
    api/checkout/route.ts
    api/waffo/webhook/route.ts       # canonical signed settlement boundary
    api/polar/webhook/route.ts       # inert 410 compatibility route
    click/[id]/route.ts
    healthz/route.ts
  billing/
    port.ts
    fixture.ts
    waffo.ts
    polar.ts                         # disabled tombstone only
  core/
    rank.ts, listing.ts, url.ts, week.ts, playback.ts, claimant.ts
  db.ts
  migrations/
tests/
scripts/
```

Pages and routes read core/store boundaries. Only the canonical Waffo route
can pass SDK-verified facts to settlement. The return query never settles a
payment and never trusts a claimed status.

## Waffo modes and configuration

`WAFFO_MODE` is required and must be one of:

| Mode | Use | Network |
|---|---|---|
| `fixture` | local/offline tests and the disposable smoke server | none |
| `waffo-test` | isolated Waffo test credentials and database | Waffo test only |
| `waffo-prod` | production credentials, public HTTPS, durable database | official Waffo API only |

Production-like startup fails closed without merchant ID, store ID, product ID,
private key, webhook public key, public HTTPS base, and durable
`DATABASE_PATH`. `WAFFO_API_BASE` is pinned to
`https://api.waffo.ai` in production. Test overrides must be public HTTPS
origins without credentials; loopback, private, reserved, and HTTP origins are
rejected. Provider checkout URLs receive the same public HTTPS validation.

Useful variables are `WAFFO_MERCHANT_ID`, `WAFFO_STORE_ID`,
`WAFFO_PRODUCT_ID`, `WAFFO_PRODUCT_NAME`, `WAFFO_PRIVATE_KEY` or
`WAFFO_PRIVATE_KEY_FILE`, `WAFFO_WEBHOOK_TEST_PUBLIC_KEY`,
`WAFFO_WEBHOOK_PROD_PUBLIC_KEY` (the legacy generic
`WAFFO_WEBHOOK_PUBLIC_KEY` is ignored in live modes),
`WAFFO_API_BASE`, `WAFFO_TIMEOUT_MS`, `PUBLIC_BASE_URL`, and
`DATABASE_PATH`. Legacy Polar variables do not select a provider.

## Provider contract

The adapter persists the intent before any network call and sends the official
anonymous checkout shape: one configured `productId`, `currency: "USD"`, a
decimal-string `priceSnapshot.amount`, `taxCategory: "digital_goods"`, the
success URL `/checkout/complete?intent=...`, immutable string metadata, and
`orderMerchantExternalId` equal to the local intent ID. A timeout, reset,
5xx, malformed response, or attach ambiguity remains recoverable as `unknown`.

Webhook handling reads the raw body and verifies it with the SDK public key and
explicit test/prod environment. Only signed `order.completed` events with
matching mode/store/order/payment status, checkout/order IDs, product, USD,
tax, exact decimal money, metadata, and local intent facts can settle. Tax is
not added to the ranked bid. The endpoint never uses browser return data.

## Offline release gates

```bash
npm ls @waffo/pancake-ts
npm run typecheck
npm test
bash scripts/test.sh
npm run build
git diff --check
npm audit --omit=dev
bash scripts/live-smoke.sh
```

The test and smoke commands use a temporary SQLite database and fixture mode;
they make zero provider calls. A production smoke without secrets must report
`BLOCKED-SECRET` or `BLOCKED-CONFIG`, never pretend that a fixture checkout is
live. `next start` verification checks `/healthz` JSON and the station desk at
`/`.

## Change boundaries and rollback

Do not edit the radio-desk skin to fix payment correctness. Payment changes
must add a focused adversarial test for the relevant identity, money, replay,
URL, or clock boundary. Keep the tree buildable and the full offline gate
green. A failed release candidate is rolled back with a reviewed change; do
not reset, clean, or force-push a shared worktree.

## Implementation sequence

### PR 1: skeleton

Health, strict TypeScript, and the offline gate.

### PR 2: board UI like outbid.lol

The radio-station desk, honest empty state, and money-first ranking surface.

### PR 3: checkout

Explicit fixture/Waffo checkout intents and paid-only settlement.

### PR 4: raise-bid

Difference-only raises with immutable facts, tie timestamps, and claimant ownership.

### PR 5: rules / about

URL hygiene, real playback, and public product rules.

### PR 6: live-smoke

Operator-only fixture smoke plus explicit blocked Waffo configuration.

### PR 9: product UI — this week’s opening song

Radio-desk polish that preserves the opening-song journey and its honesty markers.
