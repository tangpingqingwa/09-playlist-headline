#!/usr/bin/env bash
# Offline gate for main. It must stay buildable and testable without Waffo
# credentials or third-party network access.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

must_have() {
  local needle="$1"
  local file="$2"
  grep -Fq "$needle" "$file" || fail "$file missing: $needle"
}

must_not_have() {
  local needle="$1"
  local file="$2"
  if grep -Fq "$needle" "$file"; then
    fail "$file contains forbidden residue: $needle"
  fi
}

echo "== contract files =="
for file in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh; do
  [[ -s "$file" ]] || fail "missing or empty $file"
done
if ! grep -q 'main must always be buildable' CONTRIBUTING.md &&
  ! grep -q 'main` must always be buildable' CONTRIBUTING.md; then
  fail "CONTRIBUTING.md missing the main-branch build rule"
fi
must_have "track + artist + listen URL" SPEC.md
must_have "Weekly reset UTC" SPEC.md
must_have "No invented play counts" SPEC.md
must_have "Playback must be real" SPEC.md
must_have "fake streams" SPEC.md
must_have 'Minimum **$5**' SPEC.md
must_have "older wins ties" SPEC.md
must_have "raise pays difference" SPEC.md
must_have "Waffo" SPEC.md
must_have "fixture" SPEC.md
must_have "/about" SPEC.md
must_have "/rules" SPEC.md
must_have "public click" SPEC.md

echo "== CI and offline smoke boundaries =="
must_have "### PR 9: product UI" BUILD.md
must_have "bash scripts/test.sh" .github/workflows/ci.yml
for selector in \
  WAFFO_MODE \
  WAFFO_API_BASE \
  WAFFO_TIMEOUT_MS \
  WAFFO_MERCHANT_ID \
  WAFFO_STORE_ID \
  WAFFO_PRODUCT_ID \
  WAFFO_PRODUCT_NAME \
  WAFFO_PRIVATE_KEY \
  WAFFO_PRIVATE_KEY_FILE \
  WAFFO_WEBHOOK_PUBLIC_KEY \
  WAFFO_WEBHOOK_TEST_PUBLIC_KEY \
  WAFFO_WEBHOOK_PROD_PUBLIC_KEY
do
  if grep -Fqi "$selector" .github/workflows/ci.yml; then
    fail "CI must not select or inject Waffo setting ${selector}"
  fi
done
if grep -q 'scripts/live-smoke.sh' .github/workflows/ci.yml; then
  fail "CI must not call live-smoke"
fi
for file in scripts/live-smoke.sh scripts/check-built-runtime.sh scripts/preflight.mjs docs/live-smoke.md tests/live-smoke.test.ts; do
  [[ -s "$file" ]] || fail "missing or empty $file"
done
[[ -x scripts/live-smoke.sh ]] || fail "scripts/live-smoke.sh must be executable"
must_have "BLOCKED-CONFIG: WAFFO_MODE" scripts/live-smoke.sh
must_have "PASS-ERROR" docs/live-smoke.md
must_have "BLOCKED-SECRET" docs/live-smoke.md
if grep -Eq '^[[:space:]]*(bash[[:space:]]+)?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke"
fi

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 &&
  git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
  fail "secret-like path is tracked"
fi

echo "== board and honest empty state =="
for file in \
  package.json \
  tsconfig.json \
  src/app/page.tsx \
  src/app/layout.tsx \
  src/app/board.css \
  src/app/outbid-form.tsx \
  src/app/healthz/route.ts \
  src/runtime/readiness.ts \
  scripts/preflight.mjs \
  src/db.ts \
  src/core/rank.ts \
  src/core/week.ts \
  src/core/listing.ts \
  tests/healthz.test.ts \
  tests/persistence.test.ts \
  tests/product-ui.test.ts \
  tests/rank.test.ts
do
  [[ -s "$file" ]] || fail "missing or empty $file"
done
must_have "station-desk" src/app/page.tsx
must_have "studio-deck" src/app/page.tsx
must_have "claim-rail" src/app/page.tsx
must_have "No opening song" src/app/page.tsx
must_have "data-empty-week" src/app/page.tsx
must_have "PH09" src/app/page.tsx
must_have "Claim #1 for" src/app/outbid-form.tsx
must_have "amount-field" src/app/outbid-form.tsx
must_have 'name="track"' src/app/outbid-form.tsx
must_have 'name="artist"' src/app/outbid-form.tsx
must_have 'name="listenUrl"' src/app/outbid-form.tsx
must_have 'name="amountUsd"' src/app/outbid-form.tsx
must_have "Outbid" src/app/outbid-form.tsx
must_not_have "OutbidReferenceFixturePage" src/app/page.tsx
must_not_have "OUTBID_REFERENCE_FIXTURE_ROWS" src/app/page.tsx
must_not_have "DTC Picks Daily" src/app/page.tsx
must_not_have "picks.daily" src/app/page.tsx
must_have "export function rankListings" src/core/rank.ts
must_have "firstPaidAt" src/core/rank.ts
must_have "listPaidInRollingWeek" src/core/rank.ts
must_have "export function bidInRollingWeek" src/core/week.ts
must_have "ROLLING_WEEK_MS" src/core/week.ts
must_have 'scripts/preflight.mjs && next start' package.json
must_have "probeRuntimeReadiness" src/runtime/readiness.ts
must_have "SELECT 1 AS ok" src/runtime/readiness.ts
must_have ":focus-visible" src/app/board.css
if grep -RInEi 'play count|monthly listeners|1\.2M streams|<audio|waveform' \
  src/app/page.tsx src/app/outbid-form.tsx src/app/board.css; then
  fail "board UI must not invent a play count or fake stream"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/outbid-form.tsx src/app/board.css; then
  fail "empty board must not claim the studio stays dark"
fi

echo "== component action and geometry contract =="
must_have 'opening-playback' src/app/page.tsx
must_have 'data-opening-song="true"' src/app/page.tsx
must_have 'data-real-playback=' src/app/page.tsx
must_have "opening-listen" src/app/page.tsx
must_have 'data-first-click="hear"' src/app/page.tsx
must_have 'className="claim-raise"' src/app/page.tsx
must_have 'className="claim-raise-link"' src/app/page.tsx
must_have 'data-claim-raise' src/app/page.tsx
must_have 'href="#claim"' src/app/page.tsx
must_have 'data-slot="later-rows"' src/app/page.tsx
must_have ".studio-deck::before" src/app/board.css
must_have "grid-template-columns: minmax(0, 1.45fr) minmax(18rem, 0.85fr)" src/app/board.css
must_have "border: 1px dashed var(--line-strong)" src/app/board.css
must_have "border: 1px solid var(--line-strong)" src/app/board.css
must_have "empty board is honest" tests/product-ui.test.ts
must_have "occupied board leads" tests/product-ui.test.ts
must_have "real playback contracts" tests/product-ui.test.ts
must_have "homepage source has no obsolete" tests/product-ui.test.ts

echo "== retained non-hop product contract =="
must_have 'className="site-header"' src/app/layout.tsx
must_have 'className="site-nav"' src/app/layout.tsx
must_have 'href="/about"' src/app/layout.tsx
must_have 'href="/?period=today"' src/app/layout.tsx
must_have 'href="#categories"' src/app/layout.tsx
must_have 'data-station-desk=""' src/app/page.tsx
must_have 'data-slot="home-shell"' src/app/page.tsx
must_have 'data-slot="claim-form"' src/app/outbid-form.tsx
must_have 'data-slot="url-input"' src/app/outbid-form.tsx
must_have 'data-slot="claim-button"' src/app/outbid-form.tsx
must_have 'data-slot="category-rail"' src/app/home-controls.tsx
must_have 'className="studio-deck empty-deck"' src/app/page.tsx
must_have 'data-opening-song=' src/app/page.tsx
must_have 'data-real-playback=' src/app/page.tsx
must_have 'data-prize-before-price=' src/app/page.tsx
must_have 'className="opening-track"' src/app/page.tsx
must_have 'className="opening-facts later-fact"' src/app/page.tsx
must_have 'queue later-stack' src/app/page.tsx
must_have 'data-later-rank=' src/app/page.tsx
must_have 'data-later-track=' src/app/page.tsx
must_have 'data-listen-later=' src/app/page.tsx
must_have 'data-unpaid-off=' src/app/page.tsx
must_have 'Claim #1 for' src/app/outbid-form.tsx
must_have 'className="amount-field"' src/app/outbid-form.tsx
must_have 'className="card later-card"' src/app/page.tsx
must_have 'An incomplete or abandoned checkout stays off this desk' src/app/outbid-form.tsx

opening_marker="$(printf '%s-%s-%s' hear after need)"
claim_marker="$(printf '%s-%s-%s' need after hear)"
raise_marker="$(printf '%s-%s-%s' raise after hear)"
copy_first=Then
copy_second=the
copy_third=listen
copy_fourth=URL
obsolete_copy="$copy_first $copy_second $copy_third $copy_fourth"
for file in src/app/page.tsx src/app/outbid-form.tsx src/app/board.css tests/product-ui.test.ts; do
  if grep -Eqi "$opening_marker|$claim_marker|$raise_marker" "$file"; then
    fail "$file contains retired iterative action selectors"
  fi
  if grep -Fqi "$obsolete_copy" "$file"; then
    fail "$file contains retired empty-form copy"
  fi
done
must_have 'data-claim-submit=""' src/app/outbid-form.tsx
must_have 'method="post"' src/app/outbid-form.tsx
must_have 'action="/checkout"' src/app/outbid-form.tsx

echo "== checkout and provider boundary =="
for file in \
  src/billing/port.ts \
  src/billing/fixture.ts \
  src/billing/waffo.ts \
  src/billing/polar.ts \
  src/config.ts \
  src/core/store.ts \
  src/app/api/checkout/route.ts \
  src/app/api/waffo/webhook/route.ts \
  src/app/api/polar/webhook/route.ts \
  src/app/return/page.tsx \
  tests/checkout.test.ts \
  tests/persistence.test.ts \
  tests/waffo.test.ts
do
  [[ -s "$file" ]] || fail "missing or empty $file"
done
must_have "export type PaymentPort" src/billing/port.ts
must_have "createCheckout" src/billing/port.ts
must_have "handleWebhook" src/billing/port.ts
must_have "export class FixturePayment" src/billing/fixture.ts
must_have "export class WaffoPayment" src/billing/waffo.ts
must_have "verifyWebhook" src/billing/waffo.ts
must_have "order.completed" src/billing/waffo.ts
must_have "WAFFO_PRODUCT_ID" src/billing/waffo.ts
must_have "applyPaidEvent" src/core/store.ts
must_have "quoteBid" src/app/api/checkout/route.ts
must_have 'data-return="paid"' src/app/return/page.tsx
must_have 'data-return="pending"' src/app/return/page.tsx
must_have "WAFFO_MODE" src/config.ts
if grep -RInE '@polar-sh|from ["'\"'].*billing/polar' src tests >/dev/null 2>&1; then
  fail "active source/tests must not select Polar"
fi
if grep -E 'fetch\(|waffo\.ai|api\.waffo' src/billing/fixture.ts src/billing/port.ts >/dev/null; then
  fail "fixture/port must not call Waffo over the network"
fi

echo "== rules, URL hygiene, and playback =="
for file in src/app/about/page.tsx src/app/rules/page.tsx src/core/url.ts src/core/playback.ts src/app/click/[id]/route.ts tests/listing.test.ts tests/click.test.ts tests/playback.test.ts; do
  [[ -s "$file" ]] || fail "missing or empty $file"
done
must_have "Rank is the bid" src/app/about/page.tsx
must_have "public auction last 7 days" src/app/about/page.tsx
must_have "Older wins ties" src/app/rules/page.tsx
must_have "same cleaned listen link may raise" src/app/rules/page.tsx
must_have "<strong>difference</strong>" src/app/rules/page.tsx
must_have "utm_" src/core/url.ts
must_have "url_forbidden" src/core/url.ts
must_have "export function canonicalizeListenUrl" src/core/url.ts
must_have "export function playbackForListing" src/core/playback.ts
must_have "incrementListingClicks" 'src/app/click/[id]/route.ts'
must_have "NextResponse.redirect" 'src/app/click/[id]/route.ts'
must_have "302" tests/click.test.ts
must_have "empty week has no player" tests/playback.test.ts

if [[ -f package.json ]]; then
  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi
  unset WAFFO_MODE WAFFO_API_BASE WAFFO_TIMEOUT_MS WAFFO_PRODUCT_ID \
    WAFFO_PRODUCT_NAME WAFFO_MERCHANT_ID WAFFO_STORE_ID WAFFO_PRIVATE_KEY \
    WAFFO_PRIVATE_KEY_FILE WAFFO_WEBHOOK_PUBLIC_KEY \
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY WAFFO_WEBHOOK_PROD_PUBLIC_KEY
  export WAFFO_MODE=fixture
  export DATABASE_PATH=:memory:
  [[ "$WAFFO_MODE" == fixture ]] || fail "test gate must stay fixture-only"

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== production build =="
  npm run build

  echo "== built runtime =="
  bash scripts/check-built-runtime.sh

  echo "== unit tests =="
  test_log="$(mktemp)"
  trap 'rm -f "$test_log"' EXIT
  set +e
  npx tsx --test --test-concurrency=1 --test-reporter spec 'tests/**/*.test.ts' >"$test_log"
  test_status="$?"
  cat "$test_log"
  set -e
  [[ "$test_status" -eq 0 ]] || fail "unit tests failed"
  grep -Eq 'tests[[:space:]]+[1-9][0-9]*' "$test_log" || fail "test runner reported 0 tests"
  for test_name in \
    "homepage shell keeps" \
    "empty board is honest" \
    "occupied board leads" \
    "real playback contracts" \
    "unpaid checkout drafts" \
    "shared homepage geometry" \
    "period controls restore" \
    "search is limited" \
    "theme synchronization" \
    "header navigation" \
    "fixture create" \
    "abandoned checkout" \
    "bid_not_higher" \
    "GET /click" \
    "empty week has no player" \
    "healthz" \
    "runtime readiness" \
    "failed migration closes its handle" \
    "near-concurrent legacy opens serialize column upgrades and preserve data" \
    "homepage source has no obsolete"
  do
    grep -Fq "$test_name" "$test_log" || fail "required test did not run: $test_name"
  done
fi

echo "OK: buildable and testable"
