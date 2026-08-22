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

Ran `bash scripts/live-smoke.sh` on **2026-08-22** from `feat/live-smoke` (parent `3c3a065`, about/rules on `origin/main`). Local process started by the script on `http://127.0.0.1:54883`. `POLAR_LIVE` unset. `POLAR_ACCESS_TOKEN` unset. Fixture path for click/playback only. No invented paid rank: empty board first; `$4` stayed off the board; unpaid Polar checkout was not attempted. Official YouTube embed of the stored listen URL. No generated file.

| Flow | Result | Note |
|---|---|---|
| healthz | **PASS** | `GET /healthz` 200 `{ ok: true }` |
| board | **PASS** | `GET /` 200 week `2026-W34` empty + bid form. No opening song. No invented play counts. No fake stream. |
| about / rules | **PASS** | `GET /about` and `GET /rules` 200. Min $5, older wins ties, raise pays difference, weekly UTC, no fake streams, no invented play counts. |
| bid-below-min | **PASS-ERROR** | `POST /api/checkout` $4 → 400 `bid_below_min`. Board unchanged. |
| create checkout | **BLOCKED-SECRET** | `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` |
| click | **PASS** | `GET /click/lst_e35618f3-a113-4554-8155-1e96961b44a1` 302 to stored `https://www.youtube.com/watch?v=dQw4w9WgXcQ`. Clicks `0→1`. Fixture listing after live pay blocked. |
| playback | **PASS** | Official YouTube embed of the stored listen URL (`youtube.com/embed/dQw4w9WgXcQ`). No generated file. |

Process exit 0 (`PASS=5` `PASS-ERROR=1` `BLOCKED-SECRET=1` `FAIL=0`). Re-run with `POLAR_LIVE=1` and a real token to complete Polar Checkout; missing token must stay `BLOCKED-SECRET`, never a fixture listing treated as live Polar.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI.
- Does not invent a paid opening track when Polar is blocked.
- Does not invent play counts or a fake stream.
