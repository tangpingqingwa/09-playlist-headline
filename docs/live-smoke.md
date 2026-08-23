# Live smoke — Playlist Headline

Operator-only. `bash scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or GitHub Actions. CI and `scripts/test.sh` stay offline and must not set `POLAR_LIVE`.

`100%` for this unit means a **local process** walked every SPEC §14 flow. Board, about/rules, click, and playback still run when Polar secrets are missing. Live Polar checkout runs only when `POLAR_LIVE=1` and `POLAR_ACCESS_TOKEN` exists. Missing Polar secret is `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` — that is not a fixture success and is not a license to invent a paid opening track. Fixture listing is allowed only so click increment and real playback can be walked. An empty week is valid. No fake stream.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` / `GITHUB_ACTIONS=true` (override only with `LIVE_SMOKE_ALLOW_CI=1` for a local dry-run, never in Actions).
2. Starts `scripts/live-smoke-server.ts` on a free loopback port with Polar env unset and `POLAR_FIXTURE_ONLY=1`. That process serves the same App Router handlers (`/`, `/about`, `/rules`, `/healthz`, `/return`, `/api/checkout`, `/click/:id`). `next dev` is not used: webpack cannot load `node:crypto` through the client bid form.
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers `GET /healthz`.
4. Walks board, `/about`, `/rules`, `$4` `bid_below_min` (`PASS-ERROR`), create checkout (live Polar or `BLOCKED-SECRET`), click increment, real playback.
5. Live Polar: if `POLAR_LIVE` is not `1` or `POLAR_ACCESS_TOKEN` is empty, prints `BLOCKED-SECRET: POLAR_ACCESS_TOKEN`.
6. Kills the process it started and deletes the temp workdir.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`.

Live Polar sandbox (operator machine; token is sandbox-only — production `https://api.polar.sh` returns 401). Source `~/.polar/sandbox.env`, set `POLAR_LIVE=1`, unset `POLAR_FIXTURE_ONLY`, and point the client at the sandbox API:

```bash
set -a
# shellcheck disable=SC1091
source "$HOME/.polar/sandbox.env"
set +a
unset POLAR_FIXTURE_ONLY
export POLAR_LIVE=1
export POLAR_API_BASE=https://sandbox-api.polar.sh
bash scripts/live-smoke.sh
```

The live process must return a real `https://sandbox.polar.sh/…` Checkout URL. A fixture `/return?sessionId=` listing is a FAIL. Missing secret stays `BLOCKED-SECRET`; do not invent a paid row. `POLAR_API_BASE` defaults to production Polar; the live client honors the override. Never set `POLAR_LIVE` in `scripts/test.sh` or Actions.

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product, invented paid rank, or fake stream. |

## This session

Ran `bash scripts/test.sh` (offline, Polar env unset, `POLAR_FIXTURE_ONLY=1`, 49 tests) then `bash scripts/live-smoke.sh` on **2026-08-23** from `feat/live-polar-sandbox-smoke` (parent `0670b4d` / `origin/main`). Operator sourced `/Users/yann/.polar/sandbox.env` (mode 600; token length 53, webhook length 49, product id length 36 — values never printed or committed). `POLAR_LIVE=1`. `POLAR_FIXTURE_ONLY` unset. `POLAR_API_BASE=https://sandbox-api.polar.sh`. Sandbox token against production `https://api.polar.sh` is `401`. Fixture walk on script-started `http://127.0.0.1:58952` via `scripts/live-smoke-server.ts`. Live Polar walk on a second live-flagged local process. Week `2026-W34` UTC. No invented paid rank: empty board first; `$4` stayed off the board; unpaid live Polar session not listed. Official YouTube embed of the stored listen URL. No generated file.

| Flow | Result | Note |
|---|---|---|
| healthz | **PASS** | `GET /healthz` 200 `{ ok: true }` |
| board | **PASS** | `GET /` 200 week `2026-W34` empty + bid form. No opening song. No invented play counts. No fake stream. |
| about / rules | **PASS** | `GET /about` and `GET /rules` 200. Min $5, older wins ties, raise pays difference, weekly UTC, no fake streams, no invented play counts. |
| bid-below-min | **PASS-ERROR** | `POST /api/checkout` $4 → 400 `bid_below_min`. Board unchanged. |
| create checkout | **PASS** | Real Polar sandbox Checkout URL `https://sandbox.polar.sh/checkout/polar_c_0SYuFqVdgsPJrKBa8HDGCfWEU7tXNbToRoVq32Rf8E7`. Not a fixture `/return` listing. Unpaid session not listed. |
| click | **PASS** | `GET /click/lst_904c9456-803b-4053-bbf8-b26bae6f4845` 302 to stored `https://www.youtube.com/watch?v=dQw4w9WgXcQ`. Clicks `0→1`. Fixture listing after live pay for the hop only. |
| playback | **PASS** | Official YouTube embed of the stored listen URL (`youtube.com/embed/dQw4w9WgXcQ`). No generated file. |

Process exit 0 (`PASS=6` `PASS-ERROR=1` `BLOCKED-SECRET=0` `FAIL=0`). Missing Polar secret still records `BLOCKED-SECRET` and must not invent a paid opening track. `scripts/test.sh` still unsets `POLAR_LIVE` and never invokes this script.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI or `scripts/test.sh`.
- Does not invent a paid opening track when Polar is blocked.
- Does not invent play counts or a fake stream.
- Does not send the sandbox token to production `https://api.polar.sh`.
- Does not treat a fixture `/return?sessionId=` URL as live Polar checkout.
