# Playlist Headline live smoke

This is an operator-only, offline-first smoke. `scripts/test.sh` does not call
it, and CI never selects a live provider. The smoke launches the compiled
`npm start` / `next start` runtime on loopback with `WAFFO_MODE=fixture`, a
temporary file-backed SQLite database, and zero Waffo/network calls. It walks
the radio-station desk, `/about`, `/rules`, `/healthz`, the read-only
`/checkout/complete?intent=...` surface, the click redirect, and real stored
playback URLs without inventing a paid row.

The offline gate does not call `scripts/test.sh`.

## Local fixture run

```bash
bash scripts/live-smoke.sh
```

The script refuses CI unless `LIVE_SMOKE_ALLOW_CI=1` is explicitly supplied for
a local diagnostic. It unsets provider and deployment selectors, selects
`WAFFO_MODE=fixture`, checks an honest empty board, exercises `$4` as
`PASS-ERROR`, and confirms that unpaid checkout does not rank. Any
provider-looking request is a failure. The disposable database and process are
removed when the run exits.

This script is deliberately fixture-only. If `WAFFO_MODE=waffo-test` or
`WAFFO_MODE=waffo-prod` is explicitly supplied, it exits before dependency,
build, or process startup with `BLOCKED-CONFIG`; it never silently converts a
requested live run into fixture success. It also has no remote-base override:
if any non-empty `LIVE_SMOKE_BASE` is supplied, it exits before dependency,
build, or process startup with `BLOCKED-CONFIG: LIVE_SMOKE_BASE`; all mutating
requests go only to the locally spawned fixture process.

## Waffo test or production operator run

Live provider traffic is not part of this repository gate or this script. A
separate, explicitly approved operator procedure may select exactly one live
mode on a stable public HTTPS deployment, configure the mode-scoped Waffo
credentials outside Git, and run the provider-specific checkout/webhook flow.
Do not point this fixture smoke at that process; it has no remote-base escape
hatch and will block explicit live modes before startup.

Production configuration remains fail-closed when a required value is absent.
The SDK API origin is pinned to `https://api.waffo.ai`; configured test
overrides must be public HTTPS origins without credentials and may not be
loopback, private, link-local, ULA, or reserved addresses. Checkout URLs
receive the same validation. A missing key is reported as `BLOCKED-SECRET` or
`BLOCKED-CONFIG`, never as a fixture success. The legacy
`WAFFO_WEBHOOK_PUBLIC_KEY` name is ignored in live modes; use the key scoped to
the selected test or production mode. This repository gate does not call
Waffo, register a webhook, or mutate a dashboard.

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | The local flow met its contract. |
| `PASS-ERROR` | An expected invalid input was rejected and state stayed unchanged. |
| `BLOCKED-SECRET` | An approved live run lacks a named Waffo secret. |
| `BLOCKED-CONFIG` | A required mode, URL, ID, or durable database setting is absent/unsafe. |
| `FAIL` | A route, rank, redirect, or isolation invariant failed. |

The canonical settlement endpoint is `/api/waffo/webhook`. It verifies the raw
body and signed Waffo facts before calling the durable store. `/api/polar/webhook`
is a 410 compatibility tombstone and must never be used.
