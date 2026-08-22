# Live smoke — Playlist Headline

Operator-only. `bash scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or GitHub Actions. CI and `scripts/test.sh` stay offline and must not set `POLAR_LIVE`.

`100%` for this unit means a **local process** walked SPEC §14: board, about/rules, checkout (live Polar or `BLOCKED-SECRET`), click, real playback. Missing Polar secret is `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` — that is not a fixture success. Do not invent a paid rank. Do not invent a fake stream. An empty week is valid.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` and `GITHUB_ACTIONS=true`.
2. Starts `scripts/live-smoke-server.ts` on a free loopback port with Polar env unset and `POLAR_FIXTURE_ONLY=1`. That process serves the same App Router handlers (`/`, `/about`, `/rules`, `/api/checkout`, `/click/:id`, `/return`, `/healthz`). `next dev` cannot load `node:crypto` through the client bid form; this is still the product handlers, not a fake board.
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers `GET /healthz`.
4. Walks board, `/about`, `/rules`, checkout, click, playback.
5. Live Polar: only when `POLAR_LIVE=1` and `POLAR_ACCESS_TOKEN` is set. Otherwise prints `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` for checkout only. Board, about, rules, click, and playback still run.
6. Click / playback may use a **fixture** listing when live pay is blocked. Unpaid checkout never lists.
7. Kills the process it started.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`.

Live Polar (operator machine with a real token):

```bash
POLAR_LIVE=1 POLAR_ACCESS_TOKEN=… bash scripts/live-smoke.sh
```

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product, invented paid rank, or fake stream. |

## This session

Ran `bash scripts/live-smoke.sh` on **2026-08-22** from `feat/09-playlist-headline` (parent `3c3a065`, about/rules on `origin/main`). Local process started by the script on `http://127.0.0.1:53913`. `POLAR_LIVE` unset. `POLAR_ACCESS_TOKEN` unset. No invented paid rank. No fake stream.

| Flow | Result | Note |
|---|---|---|
| board | **PASS** | `GET /` 200 week `2026-W34`. Empty week + bid form. No invented opening song. No play counts. No fake stream. |
| about / rules | **PASS** | `GET /about` and `GET /rules` 200. Min $5, older wins ties, raise pays difference, weekly UTC, no fake streams, no invented play counts. |
| checkout | **BLOCKED-SECRET** | `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` |
| checkout-forbidden | **PASS-ERROR** | `https://t.me/foo` → 400 `url_forbidden`. No listing. |
| click | **PASS** | Fixture listing allowed because live pay is blocked. `GET /click/:id` 302 to stored `https://listen.example/headline-20260822142005`. Clicks `0→1`. |
| playback | **PASS** | Listen control uses that stored listen URL. Not a generated file. |

Process exit 0 (`PASS=6` `PASS-ERROR=1` `BLOCKED-SECRET=1` `FAIL=0`). Re-run with `POLAR_LIVE=1` and a real token to complete Polar Checkout. Missing token must stay `BLOCKED-SECRET`, never a fixture listing presented as live pay.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI.
- Does not invent a paid opening track when Polar is blocked.
- Does not generate or loop audio to fill an empty week.
