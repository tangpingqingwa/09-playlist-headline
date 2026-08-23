# Playlist Headline — Detailed Specification and Build Plan

**Contract:** [SPEC.md](./SPEC.md) wins on ranking, weekly UTC reset, listing shape, playback honesty, and errors.
**This file** wins on stack, module boundaries, test layout, and the PR sequence.
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md). Every `### PR N:` row is one squash-merged PR. `main` stays green.

Pay-to-rank clone of outbid.lol. Weekly public auction for the first track / opening song on a real playlist or live radio. Playback must be real. No invented play counts.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Runtime | Node 22, TypeScript `strict` |
| App | Next.js App Router (outbid-like public board) + Route Handlers |
| DB | SQLite via `better-sqlite3` (weeks, listings, payments, clicks) |
| Payments | `PaymentPort`. Adapter `fixture` in tests; live Polar when `POLAR_LIVE=1` |
| Playback | Official embed or 302 to the stored listen URL. Never generate audio |
| Tests | `node:test` + `tsx` + fixture Polar. No live Polar in CI |
| Process | `next dev` locally; `next start` in prod. `/healthz` on the same process |

**Out of stack:** Prisma, Redis, Kubernetes, a fake radio encoder, scraped play counts, a second ranking algorithm.

---

## 2. Ranking and week

```
weeks (id pk, starts_at, ends_at)          -- Monday 00:00 UTC
listings (id, week_id, listen_key, track, artist, listen_url,
          bid_usd, first_paid_at, clicks)
payments (id, listing_id, polar_session, amount_usd, kind create|raise)
```

Board query (current week only):

```
WHERE week_id = current_week_utc()
ORDER BY bid_usd DESC, first_paid_at ASC, id ASC
```

`current_week_utc()` is ISO week in UTC. Adding a second station later must not touch this `ORDER BY`.

Identity key for raise: canonical `listenUrl` + `weekId`.

---

## 3. Target tree

```
/
  SPEC.md
  BUILD.md
  README.md
  CONTRIBUTING.md
  package.json                 # PR 1
  scripts/test.sh
  scripts/live-smoke.sh        # live-smoke PR
  docs/live-smoke.md
  src/
    app/
      page.tsx                 # public board
      about/page.tsx
      rules/page.tsx
      return/page.tsx
      api/checkout/route.ts
      api/polar/webhook/route.ts
      click/[id]/route.ts
      healthz/route.ts
    core/
      rank.ts                  # ORDER BY contract
      week.ts                  # Monday 00:00 UTC
      listing.ts               # track + artist + listen URL
      url.ts                   # strip tracking, reject chat/NSFW
      playback.ts              # real listen URL / official embed only
    billing/
      port.ts
      fixture.ts
      polar.ts                 # live, env-gated
    db.ts
    config.ts
  tests/
    rank.test.ts
    week.test.ts
    listing.test.ts
    checkout.test.ts
    click.test.ts
    playback.test.ts
    fixtures/
  .github/workflows/ci.yml
```

HTTP / pages call `core/*` only. They do not import `billing/polar.ts` directly.

No application `src/` in this docs PR.

---

## 4. Tests (offline)

| Test | Assert |
|---|---|
| week | Monday 00:00 UTC included in the new week; Sunday still previous ISO week |
| rank | higher bid above; **older wins ties**; below-#1 still lists |
| raise | $5 → $12 charges **$7**; other listing cannot steal by paying $7 |
| listing | track + artist + listen URL required; play-count field rejected |
| url | `utm_source` stripped; telegram invite → `url_forbidden` |
| playback | player/embed target is the stored listen URL; no generated file; empty week has no stream |
| polar fixture | unpaid checkout does not list; paid fixture event lists |
| clicks | GET click route 302 + increments; UI does not call them plays |
| live gate | unset / `0` / `true` stay fixture; `POLAR_FIXTURE_ONLY=1` wins |

`scripts/test.sh` stays offline. Once `package.json` exists it runs `tsc --noEmit` and `node:test`. It must never call `scripts/live-smoke.sh`.

---

## 5. PR plan

Each heading below is one PR. Dependencies are hard. Do not start the next PR in the same branch.

### PR 1: skeleton / CI
- **Description:** package.json, tsconfig, Next healthz, extend `scripts/test.sh` to typecheck + run tests once src exists. CI job stays named `ci`.
- **Files:** `package.json`, `tsconfig.json`, `src/app/healthz/route.ts`, `scripts/test.sh`, `.gitignore`
- **Dependencies:** None
- **Acceptance:** `GET /healthz` → `{ ok: true }`. `bash scripts/test.sh` green offline.

### PR 2: board UI like outbid.lol
- **Description:** Public board: track, artist, listen URL, whole-dollar amount, Outbid button, ranked cards with **$** and **clicks**. Honest empty week. Real listen control only when a paid listing exists. No play counts. No fake stream.
- **Files:** `src/app/page.tsx`, `src/core/week.ts`, `src/core/rank.ts`, board styles, `tests/rank.test.ts`
- **Dependencies:** PR 1
- **Acceptance:** Empty week renders the form and no opening song. Cards show money not play counts. Sort matches SPEC.

### PR 3: checkout
- **Description:** `PaymentPort.createCheckout`. Fixture adapter for tests. Live Polar behind `POLAR_LIVE=1`. Rank changes only on paid webhook / fixture event. Min $5. Underbid still lists.
- **Files:** `src/billing/port.ts`, `src/billing/fixture.ts`, `src/billing/polar.ts`, `src/app/api/checkout/route.ts`, `src/app/api/polar/webhook/route.ts`, `src/app/return/page.tsx`, `tests/checkout.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** $5 fixture create lists at #1. Abandoned checkout does not. CI does not set `POLAR_LIVE`.

### PR 4: raise-bid
- **Description:** Same canonical listen URL in the same UTC week raises by paying the difference. Different listing pays full amount. `firstPaidAt` unchanged.
- **Files:** `src/core/listing.ts`, checkout raise path, `tests/checkout.test.ts`
- **Dependencies:** PR 3
- **Acceptance:** SPEC acceptance 5. `bid_not_higher` when raise ≤ current.

### PR 5: rules / about
- **Description:** `/about`, `/rules`. Strip tracking. Reject chat/NSFW. Reject invented play counts. Real-playback copy. Public click route.
- **Files:** `src/app/about/page.tsx`, `src/app/rules/page.tsx`, `src/core/url.ts`, `src/core/playback.ts`, `src/app/click/[id]/route.ts`, `tests/listing.test.ts`, `tests/click.test.ts`, `tests/playback.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** Rules page states min $5, older wins ties, raise pays difference, weekly UTC reset, no fake streams, no invented play counts. Tracking keys stripped.

### PR 6: live-smoke
- **Description:** Operator script walks board, about/rules, checkout (live Polar or `BLOCKED-SECRET`), click, real playback. Not in CI.
- **Files:** `scripts/live-smoke.sh`, `docs/live-smoke.md`, `tests/live-smoke.test.ts` (offline guards only)
- **Dependencies:** PR 3, PR 5
- **Acceptance:** Script is executable. `scripts/test.sh` and `.github/workflows/ci.yml` do not invoke it. Docs record PASS / PASS-ERROR / BLOCKED-SECRET. No invented paid rank. No fake stream.

### PR 9: product UI — this week’s opening song
- **Description:** Station / opening-track surface. The prize is this week’s opening song, not a centered SaaS form. Player only when a paid #1 exists, and only for the stored listen URL. Empty week has no player. Cards stay track — artist — listen, with $bid + clicks. Outbid DNA stays: Claim #1, dashed amount, ±, Outbid pill, Leaderboard/About/Rules.
- **Files:** `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/board.css`, `src/app/outbid-form.tsx`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 6 (launch-path already shipped)
- **Acceptance:** Empty week is honest and playerless. Paid #1 renders a real player/embed or listen hop to the stored URL. No invented play counts. `bash scripts/test.sh` stays offline.

---

## 6. Env

| Var | Role |
|---|---|
| `POLAR_LIVE` | `1` selects live Polar. Unset / `0` / `true` stay fixture or fail-closed |
| `POLAR_FIXTURE_ONLY` | `1` always wins |
| `POLAR_ACCESS_TOKEN` | Live Polar. Missing → live-smoke `BLOCKED-SECRET` |
| `POLAR_WEBHOOK_SECRET` | Live webhook verify |
| `POLAR_API_BASE` | Live only. Default `https://api.polar.sh`. Sandbox smoke sets `https://sandbox-api.polar.sh` |
| `POLAR_PRODUCT_ID` | Live only. Optional Polar product for custom-amount Checkout |
| `DATABASE_PATH` | SQLite file; default `./data/playlist-headline.sqlite` |

Dockerfile / runbook may land with a later deploy PR. Image must not set `POLAR_LIVE=1`.

---

## 7. Rollback

Any PR that makes `scripts/test.sh` red is reverted with `fix/` via PR. Do not force-push `main`.
