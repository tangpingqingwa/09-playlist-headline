#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live Polar or any third-party network.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== contract files =="
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done

echo "== contributing rules are documented =="
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"

echo "== SPEC mentions git collaboration =="
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"

echo "== SPEC product contract =="
grep -q 'track + artist + listen URL' SPEC.md || fail "SPEC.md missing listing shape"
grep -q 'Weekly reset UTC' SPEC.md || fail "SPEC.md missing weekly reset UTC"
grep -q 'No invented play counts' SPEC.md || fail "SPEC.md missing no invented play counts"
grep -q 'Playback must be real' SPEC.md || fail "SPEC.md missing real playback"
grep -q 'fake streams' SPEC.md || fail "SPEC.md missing no-fake-streams rule"
grep -Fq 'Minimum **$5**' SPEC.md || fail "SPEC.md missing min $5"
grep -q 'older wins ties' SPEC.md || fail "SPEC.md missing older-wins-ties"
grep -q 'raise pays difference' SPEC.md || fail "SPEC.md missing raise-pays-difference"
grep -q 'Polar' SPEC.md || fail "SPEC.md missing Polar"
grep -q 'fixture' SPEC.md || fail "SPEC.md missing fixture Polar"
grep -q '/about' SPEC.md || fail "SPEC.md missing /about"
grep -q '/rules' SPEC.md || fail "SPEC.md missing /rules"
grep -q 'public click' SPEC.md || fail "SPEC.md missing public clicks"

echo "== BUILD PR sequence through product UI =="
grep -qE '^### PR 1: skeleton' BUILD.md || fail "BUILD.md missing ### PR 1: skeleton"
grep -qE '^### PR 2: board UI like outbid.lol' BUILD.md || fail "BUILD.md missing ### PR 2: board UI like outbid.lol"
grep -qE '^### PR 3: checkout' BUILD.md || fail "BUILD.md missing ### PR 3: checkout"
grep -qE '^### PR 4: raise-bid' BUILD.md || fail "BUILD.md missing ### PR 4: raise-bid"
grep -qE '^### PR 5: rules' BUILD.md || fail "BUILD.md missing ### PR 5: rules / about"
grep -qE '^### PR 6: live-smoke' BUILD.md || fail "BUILD.md missing ### PR 6: live-smoke"
grep -qE '^### PR 9: product UI' BUILD.md || fail "BUILD.md missing ### PR 9: product UI"
if ! grep -E '^### PR [0-9]+:' BUILD.md >/dev/null; then
  fail "BUILD.md PR headings must be ### PR N: title"
fi
if grep -Eq '^\s*(bash )?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi

echo "== CI job ci =="
[[ -f .github/workflows/ci.yml ]] || fail "missing .github/workflows/ci.yml"
grep -qE '^name: ci$' .github/workflows/ci.yml || fail "ci.yml missing workflow name ci"
grep -qE '^  ci:' .github/workflows/ci.yml || fail "ci.yml missing job id ci"
grep -q 'bash scripts/test.sh' .github/workflows/ci.yml || fail "ci.yml must run scripts/test.sh"
if grep -Eqi 'POLAR_LIVE=1|POLAR_ACCESS_TOKEN=' .github/workflows/ci.yml; then
  fail "CI must not set live Polar"
fi
if grep -q 'scripts/live-smoke.sh' .github/workflows/ci.yml; then
  fail "live-smoke.sh must not be called from Actions"
fi

echo "== live-smoke stays operator-only =="
[[ -f scripts/live-smoke.sh ]] || fail "missing scripts/live-smoke.sh"
[[ -x scripts/live-smoke.sh ]] || fail "scripts/live-smoke.sh must be executable"
[[ -f docs/live-smoke.md ]] || fail "missing docs/live-smoke.md"
[[ -s docs/live-smoke.md ]] || fail "empty docs/live-smoke.md"
[[ -f tests/live-smoke.test.ts ]] || fail "missing tests/live-smoke.test.ts"
[[ -f scripts/live-smoke-server.ts ]] || fail "missing scripts/live-smoke-server.ts"
if grep -Eq '^\s*(bash )?(\./)?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi
if grep -E '^[[:space:]]*(export[[:space:]]+)?POLAR_LIVE=1' scripts/test.sh >/dev/null; then
  fail "test.sh must not set POLAR_LIVE=1"
fi
grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' scripts/live-smoke.sh \
  || fail "live-smoke.sh must name BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
grep -q 'POLAR_LIVE' scripts/live-smoke.sh \
  || fail "live-smoke.sh must gate live Polar on POLAR_LIVE"
grep -q 'PASS' docs/live-smoke.md || fail "docs/live-smoke.md missing PASS"
grep -q 'PASS-ERROR' docs/live-smoke.md || fail "docs/live-smoke.md missing PASS-ERROR"
grep -q 'BLOCKED-SECRET' docs/live-smoke.md || fail "docs/live-smoke.md missing BLOCKED-SECRET"

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
    fail "secret-like path is tracked"
  fi
fi

echo "== markdown is UTF-8 text =="
file -b --mime-encoding README.md SPEC.md BUILD.md CONTRIBUTING.md | grep -qiE 'utf-8|us-ascii' \
  || fail "docs are not UTF-8/ASCII"

echo "== skeleton files =="
for f in package.json tsconfig.json src/app/healthz/route.ts tests/healthz.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q '/healthz' src/app/healthz/route.ts || grep -q 'HealthzOk' src/app/healthz/route.ts \
  || fail "src/app/healthz/route.ts missing healthz contract"
grep -q 'ok: true' src/app/healthz/route.ts || fail "healthz route missing { ok: true }"
if grep -E '"@polar-sh/sdk"|"@polar-sh/' package.json >/dev/null 2>&1; then
  fail "do not add a live Polar SDK in this unit"
fi
if grep -R --include='*.ts' --include='*.tsx' -E "from ['\"]@polar-sh" src tests >/dev/null 2>&1; then
  fail "src/tests must not import a Polar SDK"
fi
if grep -RInE 'https?://([^/]*\.)?polar\.sh' src tests \
  | grep -v 'src/billing/polar.ts' >/dev/null 2>&1; then
  fail "only src/billing/polar.ts may mention the Polar HTTP host"
fi
if grep -RInE 'from ["'\'']\.\./.*billing/polar|from ["'\'']\.\./\.\./.*billing/polar' \
  src/app >/dev/null 2>&1; then
  fail "HTTP / pages must not import billing/polar.ts directly"
fi

echo "== board UI files =="
for f in \
  src/app/page.tsx \
  src/app/layout.tsx \
  src/app/board.css \
  src/app/outbid-form.tsx \
  src/core/week.ts \
  src/core/rank.ts \
  tests/rank.test.ts
do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'export function rankListings' src/core/rank.ts \
  || fail "rank.ts must export rankListings"
grep -q 'firstPaidAt' src/core/rank.ts \
  || fail "rank.ts must tie-break on firstPaidAt"
grep -q 'getBoardListings' src/core/rank.ts \
  || fail "rank.ts must expose getBoardListings"
grep -q 'listPaidInRollingWeek' src/core/rank.ts \
  || fail "live board must read paid listings in the rolling last 7 days"
grep -q 'isoWeekId' src/core/week.ts || fail "week.ts missing isoWeekId"
grep -q 'Monday' src/core/week.ts || fail "week.ts must document Monday UTC reset"
grep -q 'ROLLING_WEEK_MS' src/core/week.ts \
  || fail "week.ts must export the rolling last-7-days window"
grep -q 'export function bidInRollingWeek' src/core/week.ts \
  || fail "week.ts must export bidInRollingWeek"
grep -q 'export function rollingWeekStart' src/core/week.ts \
  || fail "week.ts must export rollingWeekStart"
grep -q 'Outbid' src/app/outbid-form.tsx || fail "form missing Outbid button"
grep -q 'name="track"' src/app/outbid-form.tsx || fail "form missing track"
grep -q 'name="artist"' src/app/outbid-form.tsx || fail "form missing artist"
grep -q 'name="listenUrl"' src/app/outbid-form.tsx || fail "form missing listen URL"
grep -q 'name="amountUsd"' src/app/outbid-form.tsx || fail "form missing amount"
grep -q 'data-empty-week' src/app/page.tsx || fail "board missing honest empty week"
grep -q 'No opening song' src/app/page.tsx || fail "empty week must say there is no opening song"
grep -q 'clicks' src/app/page.tsx || fail "cards missing clicks"
grep -q 'formatUsd' src/app/page.tsx || fail "cards must show money"
grep -q 'getBoardListings' src/app/page.tsx || fail "page.tsx must load listings through getBoardListings"
grep -q 'rankListings' src/app/page.tsx || fail "page.tsx must rank through rankListings"
grep -q 'currentWeekUtc' src/app/page.tsx || fail "page.tsx must use currentWeekUtc"
grep -q 'board.css' src/app/layout.tsx || fail "root layout must load board styles"
grep -q 'older' tests/rank.test.ts || fail "rank tests missing older-wins-ties"
if grep -RInEi 'play count|monthly listeners|1\.2M streams|<audio|waveform' \
  src/app/page.tsx src/app/outbid-form.tsx src/core/rank.ts src/app/board.css
then
  fail "board UI must not render play counts or a fake stream"
fi

echo "== product UI: this week's opening song =="
[[ -f tests/product-ui.test.ts ]] || fail "missing tests/product-ui.test.ts"
grep -q 'station-desk' src/app/page.tsx || fail "board must be a station desk, not a lone form"
grep -q 'studio-deck' src/app/page.tsx || fail "opening song must live on a studio deck"
grep -q 'claim-rail' src/app/page.tsx || fail "Outbid claim must sit on a rail, not the prize"
grep -q 'Leaderboard' src/app/layout.tsx || fail "nav must keep Leaderboard"
grep -q 'Claim #1 for' src/app/outbid-form.tsx || fail "form missing Claim #1"
grep -q 'amount-field' src/app/outbid-form.tsx || fail "form missing dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx || fail "form missing Outbid pill"
grep -q 'data-opening-song' src/app/page.tsx || fail "opening-song honesty flags missing"
grep -q 'data-empty-week' src/app/page.tsx || fail "empty week honesty flag missing"
grep -q 'playbackForListing' src/app/page.tsx || fail "player must use stored listen URL playback"
if grep -n 'kind === "embed"' src/app/page.tsx >/dev/null; then
  :
else
  fail "player iframe must render only for official embed of the stored URL"
fi
if grep -RInEi '1\.2M streams|monthly listeners|waveform|<audio' \
  src/app/page.tsx src/app/layout.tsx src/app/outbid-form.tsx src/app/board.css
then
  fail "product UI must not invent play counts or a fake stream"
fi

echo "== UX: first-time listener empty week is honest =="
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty week must not claim the studio stays dark on a lit cream card"
fi
grep -q 'There is no player this week' src/app/page.tsx \
  || fail "empty week must tell a first-time listener there is no player"
grep -q 'No opening song' src/app/page.tsx \
  || fail "empty week must still say there is no opening song"
grep -q 'Nobody has paid yet' src/app/page.tsx \
  || fail "empty week must stay honest about unpaid #1"
grep -q 'empty-deck' src/app/page.tsx \
  || fail "empty week must stay on the studio deck"
grep -q 'station-desk' src/app/page.tsx \
  || fail "first-time listener cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "first-time listener cut must leave the claim rail in place"
grep -q 'empty week does not claim the studio stays dark' tests/product-ui.test.ts \
  || fail "product-ui tests must cover the empty-week stays-dark contradiction"

echo "== UX: first-time listener hears paid #1 one way =="
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "paid #1 must mark one hear control"
grep -q 'Hear last 7 days' src/app/page.tsx \
  || fail "hop-only #1 must offer one hear hop"
if grep -q 'Official embed is not available' src/app/page.tsx; then
  fail "do not apologize for a missing embed next to the hop"
fi
grep -q 'data-hear-opening="embed"' src/app/page.tsx \
  || fail "official embed must be the hear path when it exists"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "hear hop must still use the click route"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-#1 cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-#1 cut must leave the claim rail in place"
grep -q 'one certain way to hear' tests/product-ui.test.ts \
  || fail "product-ui tests must cover one hear path for paid #1"

echo "== UX: first-time artist claiming the opening song =="
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "claim rail must mark empty vs take for the opening song"
grep -q 'data-claim-note' src/app/outbid-form.tsx \
  || fail "claim note must mark empty vs take"
grep -q 'claims this week' src/app/outbid-form.tsx \
  || fail "empty claim must say \$5 claims this week's opening song"
grep -q 'Need \$' src/app/outbid-form.tsx \
  || fail "occupied claim must name the dollar amount to take #1"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "occupied claim must surface raise-pays-difference next to Claim #1"
grep -q 'first-time artist claiming the opening song' tests/product-ui.test.ts \
  || fail "product-ui tests must cover first-time artist claim certainty"
grep -q 'Claim #1 for' src/app/outbid-form.tsx || fail "artist claim cut must keep Claim #1"
grep -q 'amount-field' src/app/outbid-form.tsx || fail "artist claim cut must keep dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx || fail "artist claim cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "artist claim cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "artist claim cut must leave the claim rail in place"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "artist claim cut must not redo the hear path"
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "artist claim cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener occupied listen is the first read =="
grep -q 'data-hear-first' src/app/page.tsx \
  || fail "occupied week must mark hear-first so listen is the first read"
grep -q 'data-opening-song="true"' src/app/page.tsx \
  || fail "occupied opening song must stay on the studio deck"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "occupied week must mark hearing the paid opening as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "occupied first read must name this week's opening song before Claim #1"
grep -q 'occupied listen is the first read' tests/product-ui.test.ts \
  || fail "product-ui tests must cover occupied listen as the first read"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-first cut must keep one hear path"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-first cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-first cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-first cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-first cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-first cut must leave the claim rail in place"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-first cut must not undo the artist claim rail"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-first cut must keep the station-desk columns"
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-first cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-first cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time artist raising after listen-first =="
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "occupied week must mark a raise hop after the hear lede"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "raise hop must jump to the claim rail"
grep -q 'Need ' src/app/page.tsx \
  || fail "raise hop must name Need \$N to take #1 above the fold"
grep -q 'raising after listen-first' tests/product-ui.test.ts \
  || fail "product-ui tests must cover raising after listen-first"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "raise-after-hear cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "raise-after-hear cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "raise-after-hear cut must keep one hear path"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "raise-after-hear cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "raise-after-hear cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "raise-after-hear cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "raise-after-hear cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "raise-after-hear cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "raise-after-hear cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "raise-after-hear cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "raise-after-hear cut must keep the station-desk columns"
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "raise-after-hear cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "raise-after-hear cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing after Need \$N hop =="
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "occupied week must mark hear as the first click after Need \$N"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "occupied week must mark the hear hop after the raise line"
grep -q 'occupied hear is the first click' tests/product-ui.test.ts \
  || fail "product-ui tests must cover hear as the first click after Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "hear-after-raise cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "hear-after-raise cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "hear-after-raise cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "hear-after-raise cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "hear-after-raise cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-after-raise cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "hear hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-after-raise cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "hear-after-raise cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-after-raise cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-after-raise cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-after-raise cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-after-raise cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-after-raise cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-after-raise cut must keep the station-desk columns"
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-after-raise cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-after-raise cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time artist raising after Hear is first click =="
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "occupied week must mark raise after Hear-first"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "occupied raise hop must name the difference next to Need \$N"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "occupied raise hop must say same listen URL pays only the difference"
grep -q 'occupied raise after Hear-first' tests/product-ui.test.ts \
  || fail "product-ui tests must cover raise after Hear-first"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep Hear as the first click"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "raise-after-hear-first cut must keep one hear path"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "raise-after-hear-first cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "raise-after-hear-first cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "raise-after-hear-first cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "raise-after-hear-first cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "raise-after-hear-first cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "raise-after-hear-first cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "raise-after-hear-first cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "raise-after-hear-first cut must keep the station-desk columns"
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "raise-after-hear-first cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "raise-after-hear-first cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing after Need \$N names the difference =="
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "occupied week must still name the raise difference after Need \$N"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "occupied raise hop must keep same listen URL pays only the difference"
grep -q 'occupied hear after the named raise' tests/product-ui.test.ts \
  || fail "product-ui tests must cover hear after the named raise difference"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "do not add a second Hear hop after the named raise difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "do not add a second Hear hop after the named raise difference"
fi
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep raise after Hear-first"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep Hear as the first click"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "hear-after-difference leftover must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-after-difference leftover must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "occupied hear must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-after-difference leftover must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "hear-after-difference leftover must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-after-difference leftover must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-after-difference leftover must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-after-difference leftover must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-after-difference leftover must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-after-difference leftover must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-after-difference leftover must keep the station-desk columns"
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-after-difference leftover must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-after-difference leftover must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing is one first Hear =="
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "occupied week must mark one first Hear so two Hear cues do not split attention"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "one-first Hear must concentrate the existing first Hear hop"
grep -q 'occupied hear is one first Hear' tests/product-ui.test.ts \
  || fail "product-ui tests must cover one first Hear without a second hop"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "one-first Hear must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "one-first Hear must not add a second Hear hop after the difference"
fi
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "one-first Hear cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "one-first Hear cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "one-first Hear cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "one-first Hear cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "one-first Hear cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "one-first Hear cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "one-first Hear cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "one-first Hear cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "one-first Hear cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "one-first Hear cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "one-first Hear hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "one-first Hear cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "one-first Hear cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "one-first Hear cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "one-first Hear cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "one-first Hear cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "one-first Hear cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "one-first Hear cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "one-first Hear cut must keep the station-desk columns"
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "one-first Hear cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "one-first Hear cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time artist Need \$N after one Hear is certain =="
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "occupied week must concentrate the existing Need \$N hop after one Hear"
grep -q 'className="need-after-hear' src/app/page.tsx \
  || fail "Need \$N after Hear must stay the existing #claim hop, not a second Hear"
grep -q 'occupied Need $N after one Hear is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Need \$N after one Hear"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "Need-after-Hear must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "Need-after-Hear must not add a second Hear hop after the difference"
fi
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "Need-after-Hear cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "Need-after-Hear cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "Need-after-Hear hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "Need-after-Hear cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "Need-after-Hear cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "Need-after-Hear cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "Need-after-Hear cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "Need-after-Hear cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "Need-after-Hear cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "Need-after-Hear cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "Need-after-Hear cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "Need-after-Hear cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must be a dashed raise control, not quieter text under Hear"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must win the raise click as a dashed control, not a recolor"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "Need-after-Hear cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "Need-after-Hear cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing after Need \$N is the raise control =="
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "occupied week must concentrate the existing first Hear after Need \$N"
grep -q 'className="listen opening-listen hear-after-need' src/app/page.tsx \
  || fail "Hear after Need \$N must stay the existing first Hear hop, not a second Hear"
grep -q 'occupied hear after Need $N is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Hear after Need \$N is the raise control"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "hear-after-need must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "hear-after-need must not add a second Hear hop after the difference"
fi
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "hear-after-need cut must keep Need \$N as the raise control"
grep -q 'className="need-after-hear' src/app/page.tsx \
  || fail "hear-after-need cut must keep the existing Need \$N #claim hop"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "hear-after-need cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "hear-after-need cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "hear-after-need cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "hear-after-need cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "hear-after-need cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "hear-after-need cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "hear-after-need cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "hear-after-need cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "hear-after-need cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "hear-after-need cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "hear-after-need cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-after-need cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "hear-after-need hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-after-need cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "hear-after-need cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-after-need cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-after-need cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-after-need cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-after-need cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-after-need cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-after-need cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "hear-after-need cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "hear-after-need cut must keep hop-local Hear size after Need \$N"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
hear_after_need_rule="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need \{/,/\}/' src/app/board.css)"
echo "$hear_after_need_rule" | grep -q 'min-height: 2.75rem' \
  || fail "hear-after-need must make Hear taller than the Need \$N raise box"
if echo "$hear_after_need_rule" | grep -q 'background:'; then
  fail "hear-after-need must concentrate Hear by size, not a recolor"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-after-need cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-after-need cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time artist Need \$N after Hear is re-concentrated =="
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "occupied week must concentrate the existing Need \$N hop after Hear is taller"
grep -q 'className="need-after-hear need-after-hear-two' src/app/page.tsx \
  || fail "Need \$N after Hear is re-concentrated must stay the existing #claim hop, not a second Hear"
grep -q 'occupied Need $N after Hear is re-concentrated is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Need \$N after Hear is re-concentrated"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "Need-after-Hear-two must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "Need-after-Hear-two must not add a second Hear hop after the difference"
fi
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep Hear after Need \$N"
grep -q 'className="listen opening-listen hear-after-need' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "Need-after-Hear-two hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-two cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-two cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-two cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-two cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "Need-after-Hear-two cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "Need-after-Hear-two cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "Need-after-Hear-two cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "Need-after-Hear-two cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "Need-after-Hear-two cut must keep hop-local Hear size after Need \$N"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_two_rule="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-three/ {print} /need-after-hear-three/ {exit}')"
if echo "$need_after_hear_two_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-two must concentrate Need \$N by size, not a recolor"
fi
if echo "$need_after_hear_two_rule" | grep -q 'border:'; then
  fail "Need-after-Hear-two must keep the existing dashed raise box, not restyle the border"
fi
echo "$need_after_hear_two_rule" | grep -q 'min-height: 2.45rem' \
  || fail "Need-after-Hear-two must make Need \$N taller than the quieter dashed box"
hear_after_need_two_rule="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need \{/,/\}/' src/app/board.css)"
echo "$hear_after_need_two_rule" | grep -q 'min-height: 2.75rem' \
  || fail "Need-after-Hear-two must keep Hear taller than the concentrated Need \$N box"
if echo "$hear_after_need_two_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-two must not recolor Hear"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "Need-after-Hear-two cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "Need-after-Hear-two cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing after Need \$N is re-concentrated =="
grep -q 'data-hear-after-need-two' src/app/page.tsx \
  || fail "occupied week must concentrate the existing first Hear after Need \$N is re-concentrated"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two' src/app/page.tsx \
  || fail "Hear after Need \$N is re-concentrated must stay the existing first Hear hop, not a second Hear"
grep -q 'occupied hear after Need $N is re-concentrated is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Hear after Need \$N is re-concentrated"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "hear-after-need-two must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "hear-after-need-two must not add a second Hear hop after the difference"
fi
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep Need \$N after Hear is taller"
grep -q 'className="need-after-hear need-after-hear-two' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep the existing Need \$N #claim hop"
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep Hear after Need \$N"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "hear-after-need-two cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-after-need-two cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "hear-after-need-two hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-after-need-two cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "hear-after-need-two cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-after-need-two cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-after-need-two cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-after-need-two cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-after-need-two cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-after-need-two cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-after-need-two cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "hear-after-need-two cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "hear-after-need-two cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "hear-after-need-two cut must keep hop-local Hear size after Need \$N"
grep -q '.opening-listen.hear-after-need.hear-after-need-two' src/app/board.css \
  || fail "hear-after-need-two cut must keep hop-local Hear size after Need \$N is re-concentrated"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_two_keep_prior="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-three/ {print} /need-after-hear-three/ {exit}')"
if echo "$need_after_hear_two_keep_prior" | grep -q 'background:'; then
  fail "hear-after-need-two must not recolor Need \$N"
fi
if echo "$need_after_hear_two_keep_prior" | grep -q 'border:'; then
  fail "hear-after-need-two must keep the existing dashed raise box, not restyle the border"
fi
hear_after_need_two_block="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-three/ {print} /hear-after-need-three/ {exit}')"
if echo "$hear_after_need_two_block" | grep -q 'background:'; then
  fail "hear-after-need-two must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_two_block" | grep -q 'border:'; then
  fail "hear-after-need-two must keep the existing filled Hear pill, not restyle the border"
fi
need_after_hear_two_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-three/ {print} /need-after-hear-three/ {exit}')"
echo "$need_after_hear_two_keep" | grep -q 'min-height: 2.45rem' \
  || fail "hear-after-need-two must keep Need \$N at the re-concentrated raise size"
hear_after_need_keep="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need \{/,/\}/' src/app/board.css)"
echo "$hear_after_need_keep" | grep -q 'min-height: 2.75rem' \
  || fail "hear-after-need-two must keep the prior Hear size stamp"
hear_after_need_two_size="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-three/ {print} /hear-after-need-three/ {exit}')"
echo "$hear_after_need_two_size" | grep -q 'min-height: 3.05rem' \
  || fail "hear-after-need-two must make Hear taller than the re-concentrated Need \$N box"
echo "$hear_after_need_two_size" | grep -q 'font-size: 1.12rem' \
  || fail "hear-after-need-two must make Hear type larger than the Need \$N raise box"
if echo "$hear_after_need_two_size" | grep -q 'background:'; then
  fail "hear-after-need-two must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_two_size" | grep -q 'border:'; then
  fail "hear-after-need-two must keep the existing Hear pill, not restyle the border"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-after-need-two cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-after-need-two cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time artist Need \$N after Hear is re-concentrated again =="
grep -q 'data-need-after-hear-three' src/app/page.tsx \
  || fail "occupied week must concentrate the existing Need \$N hop after Hear is taller again"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three' src/app/page.tsx \
  || fail "Need \$N after Hear is re-concentrated again must stay the existing #claim hop, not a second Hear"
grep -q 'occupied Need $N after Hear is re-concentrated again is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Need \$N after Hear is re-concentrated again"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "Need-after-Hear-three must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "Need-after-Hear-three must not add a second Hear hop after the difference"
fi
grep -q 'data-hear-after-need-two' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep Hear after Need \$N is re-concentrated"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep Need \$N after Hear is taller"
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep Hear after Need \$N"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "Need-after-Hear-three hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-three cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-three cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-three cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-three cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "Need-after-Hear-three cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "Need-after-Hear-three cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "Need-after-Hear-three cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated again"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "Need-after-Hear-three cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three' src/app/board.css \
  || fail "Need-after-Hear-three cut must keep hop-local Need \$N size after Hear is taller again"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "Need-after-Hear-three cut must keep hop-local Hear size after Need \$N"
grep -q '.opening-listen.hear-after-need.hear-after-need-two' src/app/board.css \
  || fail "Need-after-Hear-three cut must keep hop-local Hear size after Need \$N is re-concentrated"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_two_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-three/ {print} /need-after-hear-three/ {exit}')"
if echo "$need_after_hear_two_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-three must not recolor the prior Need \$N stamp"
fi
if echo "$need_after_hear_two_keep" | grep -q 'border:'; then
  fail "Need-after-Hear-three must keep the existing dashed raise box, not restyle the prior stamp"
fi
need_after_hear_three_rule="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-four/ {print} /need-after-hear-four/ {exit}')"
if echo "$need_after_hear_three_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-three must concentrate Need \$N by size, not a recolor"
fi
if echo "$need_after_hear_three_rule" | grep -q 'border:'; then
  fail "Need-after-Hear-three must keep the existing dashed raise box, not restyle the border"
fi
echo "$need_after_hear_two_keep" | grep -q 'min-height: 2.45rem' \
  || fail "Need-after-Hear-three must keep the prior Need \$N raise size"
echo "$need_after_hear_three_rule" | grep -q 'min-height: 2.75rem' \
  || fail "Need-after-Hear-three must make Need \$N taller than the quieter dashed box"
echo "$need_after_hear_three_rule" | grep -q 'font-size: 1.02rem' \
  || fail "Need-after-Hear-three must make Need \$N type larger than the quieter dashed box"
hear_after_need_two_keep="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-three/ {print} /hear-after-need-three/ {exit}')"
echo "$hear_after_need_two_keep" | grep -q 'min-height: 3.05rem' \
  || fail "Need-after-Hear-three must keep Hear taller than the concentrated Need \$N box"
if echo "$hear_after_need_two_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-three must not recolor Hear"
fi
if echo "$need_after_hear_three_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-three must concentrate Need \$N by size, not a recolor"
fi
if echo "$need_after_hear_three_rule" | grep -q 'border:'; then
  fail "Need-after-Hear-three must keep the existing dashed raise box, not restyle the border"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "Need-after-Hear-three cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "Need-after-Hear-three cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing after Need \$N is re-concentrated again =="
grep -q 'data-hear-after-need-three' src/app/page.tsx \
  || fail "occupied week must concentrate the existing first Hear after Need \$N is re-concentrated again"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three' src/app/page.tsx \
  || fail "Hear after Need \$N is re-concentrated again must stay the existing first Hear hop, not a second Hear"
grep -q 'occupied hear after Need $N is re-concentrated again is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Hear after Need \$N is re-concentrated again"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "hear-after-need-three must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "hear-after-need-three must not add a second Hear hop after the difference"
fi
grep -q 'data-need-after-hear-three' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep Need \$N after Hear is taller again"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep the existing Need \$N #claim hop"
grep -q 'data-hear-after-need-two' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep Hear after Need \$N is re-concentrated"
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep Need \$N after Hear is taller"
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep Hear after Need \$N"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "hear-after-need-three cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-after-need-three cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "hear-after-need-three hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-after-need-three cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "hear-after-need-three cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-after-need-three cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-after-need-three cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-after-need-three cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-after-need-three cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-after-need-three cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-after-need-three cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "hear-after-need-three cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated again"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "hear-after-need-three cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three' src/app/board.css \
  || fail "hear-after-need-three cut must keep hop-local Need \$N size after Hear is taller again"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "hear-after-need-three cut must keep hop-local Hear size after Need \$N"
grep -q '.opening-listen.hear-after-need.hear-after-need-two' src/app/board.css \
  || fail "hear-after-need-three cut must keep hop-local Hear size after Need \$N is re-concentrated"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three' src/app/board.css \
  || fail "hear-after-need-three cut must keep hop-local Hear size after Need \$N is re-concentrated again"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_three_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-four/ {print} /need-after-hear-four/ {exit}')"
if echo "$need_after_hear_three_keep" | grep -q 'background:'; then
  fail "hear-after-need-three must not recolor Need \$N"
fi
if echo "$need_after_hear_three_keep" | grep -q 'border:'; then
  fail "hear-after-need-three must keep the existing dashed raise box, not restyle the border"
fi
hear_after_need_two_keep_prior="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-three/ {print} /hear-after-need-three/ {exit}')"
if echo "$hear_after_need_two_keep_prior" | grep -q 'background:'; then
  fail "hear-after-need-three must not recolor the prior Hear stamp"
fi
if echo "$hear_after_need_two_keep_prior" | grep -q 'border:'; then
  fail "hear-after-need-three must keep the existing filled Hear pill, not restyle the prior stamp"
fi
hear_after_need_three_rule="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-four/ {print} /hear-after-need-four/ {exit}')"
if echo "$hear_after_need_three_rule" | grep -q 'background:'; then
  fail "hear-after-need-three must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_three_rule" | grep -q 'border:'; then
  fail "hear-after-need-three must keep the existing filled Hear pill, not restyle the border"
fi
echo "$need_after_hear_three_keep" | grep -q 'min-height: 2.75rem' \
  || fail "hear-after-need-three must keep Need \$N at the re-concentrated-again raise size"
echo "$hear_after_need_two_keep_prior" | grep -q 'min-height: 3.05rem' \
  || fail "hear-after-need-three must keep the prior Hear size stamp"
echo "$hear_after_need_three_rule" | grep -q 'min-height: 3.35rem' \
  || fail "hear-after-need-three must make Hear taller than the re-concentrated-again Need \$N box"
echo "$hear_after_need_three_rule" | grep -q 'font-size: 1.22rem' \
  || fail "hear-after-need-three must make Hear type larger than the Need \$N raise box"
if echo "$hear_after_need_three_rule" | grep -q 'background:'; then
  fail "hear-after-need-three must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_three_rule" | grep -q 'border:'; then
  fail "hear-after-need-three must keep the existing Hear pill, not restyle the border"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-after-need-three cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-after-need-three cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time artist Need \$N after Hear is re-concentrated again after a louder Hear =="
grep -q 'data-need-after-hear-four' src/app/page.tsx \
  || fail "occupied week must concentrate the existing Need \$N hop after Hear is taller again after a louder Hear"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four' src/app/page.tsx \
  || fail "Need \$N after Hear is re-concentrated again after a louder Hear must stay the existing #claim hop, not a second Hear"
grep -q 'occupied Need $N after Hear is re-concentrated again after a louder Hear is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Need \$N after Hear is re-concentrated again after a louder Hear"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "Need-after-Hear-four must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "Need-after-Hear-four must not add a second Hear hop after the difference"
fi
grep -q 'data-hear-after-need-three' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Hear after Need \$N is re-concentrated again"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-three' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Need \$N after Hear is taller again"
grep -q 'data-hear-after-need-two' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Hear after Need \$N is re-concentrated"
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Need \$N after Hear is taller"
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Hear after Need \$N"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "Need-after-Hear-four hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-four cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-four cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-four cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-four cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "Need-after-Hear-four cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated again after a louder Hear"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep hop-local Need \$N size after Hear is taller again"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three.need-after-hear-four' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep hop-local Need \$N size after Hear is taller again after a louder Hear"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep hop-local Hear size after Need \$N"
grep -q '.opening-listen.hear-after-need.hear-after-need-two' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep hop-local Hear size after Need \$N is re-concentrated"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three' src/app/board.css \
  || fail "Need-after-Hear-four cut must keep hop-local Hear size after Need \$N is re-concentrated again"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_two_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-three/ {print} /need-after-hear-three/ {exit}')"
if echo "$need_after_hear_two_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-four must not recolor the prior Need \$N stamp"
fi
if echo "$need_after_hear_two_keep" | grep -q 'border:'; then
  fail "Need-after-Hear-four must keep the existing dashed raise box, not restyle the prior stamp"
fi
need_after_hear_three_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-four/ {print} /need-after-hear-four/ {exit}')"
if echo "$need_after_hear_three_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-four must not recolor the re-concentrated-again Need \$N stamp"
fi
if echo "$need_after_hear_three_keep" | grep -q 'border:'; then
  fail "Need-after-Hear-four must keep the existing dashed raise box, not restyle the re-concentrated-again stamp"
fi
need_after_hear_four_rule="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-five/ {print} /need-after-hear-five/ {exit}')"
if echo "$need_after_hear_four_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-four must concentrate Need \$N by size, not a recolor"
fi
if echo "$need_after_hear_four_rule" | grep -q 'border:'; then
  fail "Need-after-Hear-four must keep the existing dashed raise box, not restyle the border"
fi
echo "$need_after_hear_two_keep" | grep -q 'min-height: 2.45rem' \
  || fail "Need-after-Hear-four must keep the prior Need \$N raise size"
echo "$need_after_hear_three_keep" | grep -q 'min-height: 2.75rem' \
  || fail "Need-after-Hear-four must keep the re-concentrated-again Need \$N raise size"
echo "$need_after_hear_four_rule" | grep -q 'min-height: 3.05rem' \
  || fail "Need-after-Hear-four must make Need \$N taller than the quieter dashed box under the louder Hear"
echo "$need_after_hear_four_rule" | grep -q 'font-size: 1.12rem' \
  || fail "Need-after-Hear-four must make Need \$N type larger than the quieter dashed box"
hear_after_need_three_keep="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-four/ {print} /hear-after-need-four/ {exit}')"
echo "$hear_after_need_three_keep" | grep -q 'min-height: 3.35rem' \
  || fail "Need-after-Hear-four must keep Hear taller than the concentrated Need \$N box"
if echo "$hear_after_need_three_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-four must not recolor Hear"
fi
if echo "$need_after_hear_four_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-four must concentrate Need \$N by size, not a recolor"
fi
if echo "$need_after_hear_four_rule" | grep -q 'border:'; then
  fail "Need-after-Hear-four must keep the existing dashed raise box, not restyle the border"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "Need-after-Hear-four cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "Need-after-Hear-four cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing after Need \$N is re-concentrated again after a louder Need =="
grep -q 'data-hear-after-need-four' src/app/page.tsx \
  || fail "occupied week must concentrate the existing first Hear after Need \$N is re-concentrated again"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four' src/app/page.tsx \
  || fail "Hear after Need \$N is re-concentrated again must stay the existing first Hear hop, not a second Hear"
grep -q 'occupied hear after Need $N is re-concentrated again after a louder Need is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Hear after Need \$N is re-concentrated again after a louder Need"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "hear-after-need-four must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "hear-after-need-four must not add a second Hear hop after the difference"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "hear-after-need-four must not add a second named Need hop"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "hear-after-need-four must not add a second named Hear hop"
fi
grep -q 'data-need-after-hear-four' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Need \$N after Hear is taller again after a louder Hear"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep the existing Need \$N #claim hop"
grep -q 'data-hear-after-need-three' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Hear after Need \$N is re-concentrated again"
grep -q 'data-need-after-hear-three' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Need \$N after Hear is taller again"
grep -q 'data-hear-after-need-two' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Hear after Need \$N is re-concentrated"
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Need \$N after Hear is taller"
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Hear after Need \$N"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "hear-after-need-four cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-after-need-four cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "hear-after-need-four hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-after-need-four cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "hear-after-need-four cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-after-need-four cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-after-need-four cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-after-need-four cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-after-need-four cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-after-need-four cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-after-need-four cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated again after a louder Need"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Need \$N size after Hear is taller again"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three.need-after-hear-four' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Need \$N size after Hear is taller again after a louder Hear"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Hear size after Need \$N"
grep -q '.opening-listen.hear-after-need.hear-after-need-two' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Hear size after Need \$N is re-concentrated"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Hear size after Need \$N is re-concentrated again"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three.hear-after-need-four' src/app/board.css \
  || fail "hear-after-need-four cut must keep hop-local Hear size after Need \$N is re-concentrated again after a louder Need"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_four_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-five/ {print} /need-after-hear-five/ {exit}')"
if echo "$need_after_hear_four_keep" | grep -q 'background:'; then
  fail "hear-after-need-four must not recolor Need \$N"
fi
if echo "$need_after_hear_four_keep" | grep -q 'border:'; then
  fail "hear-after-need-four must keep the existing dashed raise box, not restyle the border"
fi
hear_after_need_three_keep_prior="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-four/ {print} /hear-after-need-four/ {exit}')"
if echo "$hear_after_need_three_keep_prior" | grep -q 'background:'; then
  fail "hear-after-need-four must not recolor the prior Hear stamp"
fi
if echo "$hear_after_need_three_keep_prior" | grep -q 'border:'; then
  fail "hear-after-need-four must keep the existing filled Hear pill, not restyle the prior stamp"
fi
hear_after_need_four_rule="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-five/ {print} /hear-after-need-five/ {exit}')"
if echo "$hear_after_need_four_rule" | grep -q 'background:'; then
  fail "hear-after-need-four must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_four_rule" | grep -q 'border:'; then
  fail "hear-after-need-four must keep the existing filled Hear pill, not restyle the border"
fi
echo "$need_after_hear_four_keep" | grep -q 'min-height: 3.05rem' \
  || fail "hear-after-need-four must keep Need \$N at the re-concentrated-again raise size"
echo "$hear_after_need_three_keep_prior" | grep -q 'min-height: 3.35rem' \
  || fail "hear-after-need-four must keep the prior Hear size stamp"
echo "$hear_after_need_four_rule" | grep -q 'min-height: 3.65rem' \
  || fail "hear-after-need-four must make Hear taller than the re-concentrated-again Need \$N box"
echo "$hear_after_need_four_rule" | grep -q 'font-size: 1.32rem' \
  || fail "hear-after-need-four must make Hear type larger than the Need \$N raise box"
if echo "$hear_after_need_four_rule" | grep -q 'background:'; then
  fail "hear-after-need-four must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_four_rule" | grep -q 'border:'; then
  fail "hear-after-need-four must keep the existing Hear pill, not restyle the border"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-after-need-four cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-after-need-four cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time artist Need \$N after Hear is re-concentrated again after a louder Hear again =="
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "occupied week must concentrate the existing Need \$N hop after Hear is taller again after a louder Hear again"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "Need \$N after Hear is re-concentrated again after a louder Hear again must stay the existing #claim hop, not a second Hear"
grep -q 'occupied Need $N after Hear is re-concentrated again after a louder Hear again is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Need \$N after Hear is re-concentrated again after a louder Hear again"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "Need-after-Hear-five must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "Need-after-Hear-five must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "Need-after-Hear-five must not add a second named Hear hop"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "Need-after-Hear-five must not add a second named Need hop"
fi
grep -q 'data-hear-after-need-four' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Hear after Need \$N is re-concentrated again after a louder Need"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-four' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Need \$N after Hear is taller again after a louder Hear"
grep -q 'data-hear-after-need-three' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Hear after Need \$N is re-concentrated again"
grep -q 'data-need-after-hear-three' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Need \$N after Hear is taller again"
grep -q 'data-hear-after-need-two' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Hear after Need \$N is re-concentrated"
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Need \$N after Hear is taller"
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Hear after Need \$N"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "Need-after-Hear-five hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-five cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-five cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-five cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "Need-after-Hear-five cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "Need-after-Hear-five cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated again after a louder Hear again"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Need \$N size after Hear is taller again"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three.need-after-hear-four' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Need \$N size after Hear is taller again after a louder Hear"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three.need-after-hear-four.need-after-hear-five' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Need \$N size after Hear is taller again after a louder Hear again"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Hear size after Need \$N"
grep -q '.opening-listen.hear-after-need.hear-after-need-two' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Hear size after Need \$N is re-concentrated"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Hear size after Need \$N is re-concentrated again"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three.hear-after-need-four' src/app/board.css \
  || fail "Need-after-Hear-five cut must keep hop-local Hear size after Need \$N is re-concentrated again after a louder Need"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_two_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-three/ {print} /need-after-hear-three/ {exit}')"
if echo "$need_after_hear_two_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-five must not recolor the prior Need \$N stamp"
fi
if echo "$need_after_hear_two_keep" | grep -q 'border:'; then
  fail "Need-after-Hear-five must keep the existing dashed raise box, not restyle the prior stamp"
fi
need_after_hear_three_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-four/ {print} /need-after-hear-four/ {exit}')"
if echo "$need_after_hear_three_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-five must not recolor the re-concentrated-again Need \$N stamp"
fi
if echo "$need_after_hear_three_keep" | grep -q 'border:'; then
  fail "Need-after-Hear-five must keep the existing dashed raise box, not restyle the re-concentrated-again stamp"
fi
need_after_hear_four_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four \{/,/\}/' src/app/board.css | awk 'NR==1 || !/need-after-hear-five/ {print} /need-after-hear-five/ {exit}')"
if echo "$need_after_hear_four_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-five must not recolor the prior Need \$N stamp after the louder Hear"
fi
if echo "$need_after_hear_four_keep" | grep -q 'border:'; then
  fail "Need-after-Hear-five must keep the existing dashed raise box, not restyle the prior stamp"
fi
need_after_hear_five_rule="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four\.need-after-hear-five \{/,/\}/' src/app/board.css)"
if echo "$need_after_hear_five_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-five must concentrate Need \$N by size, not a recolor"
fi
if echo "$need_after_hear_five_rule" | grep -q 'border:'; then
  fail "Need-after-Hear-five must keep the existing dashed raise box, not restyle the border"
fi
echo "$need_after_hear_two_keep" | grep -q 'min-height: 2.45rem' \
  || fail "Need-after-Hear-five must keep the prior Need \$N raise size"
echo "$need_after_hear_three_keep" | grep -q 'min-height: 2.75rem' \
  || fail "Need-after-Hear-five must keep the re-concentrated-again Need \$N raise size"
echo "$need_after_hear_four_keep" | grep -q 'min-height: 3.05rem' \
  || fail "Need-after-Hear-five must keep the louder-Hear Need \$N raise size"
echo "$need_after_hear_five_rule" | grep -q 'min-height: 3.35rem' \
  || fail "Need-after-Hear-five must make Need \$N taller than the quieter dashed box under the louder Hear"
echo "$need_after_hear_five_rule" | grep -q 'font-size: 1.22rem' \
  || fail "Need-after-Hear-five must make Need \$N type larger than the quieter dashed box"
hear_after_need_four_keep="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-five/ {print} /hear-after-need-five/ {exit}')"
echo "$hear_after_need_four_keep" | grep -q 'min-height: 3.65rem' \
  || fail "Need-after-Hear-five must keep Hear taller than the concentrated Need \$N box"
if echo "$hear_after_need_four_keep" | grep -q 'background:'; then
  fail "Need-after-Hear-five must not recolor Hear"
fi
if echo "$need_after_hear_five_rule" | grep -q 'background:'; then
  fail "Need-after-Hear-five must concentrate Need \$N by size, not a recolor"
fi
if echo "$need_after_hear_five_rule" | grep -q 'border:'; then
  fail "Need-after-Hear-five must keep the existing dashed raise box, not restyle the border"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "Need-after-Hear-five cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "Need-after-Hear-five cut must not revive the stays-dark empty week"
fi

echo "== UX: first-time listener hearing after Need \$N is re-concentrated again after a louder Need again =="
grep -q 'data-hear-after-need-five' src/app/page.tsx \
  || fail "occupied week must concentrate the existing first Hear after Need \$N is re-concentrated again"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"' src/app/page.tsx \
  || fail "Hear after Need \$N is re-concentrated again must stay the existing first Hear hop, not a second Hear"
grep -q 'occupied hear after Need $N is re-concentrated again after a louder Need again is certain' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Hear after Need \$N is re-concentrated again after a louder Need again"
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "hear-after-need-five must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "hear-after-need-five must not add a second Hear hop after the difference"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "hear-after-need-five must not add a second named Need hop"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "hear-after-need-five must not add a second named Hear hop"
fi
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Need \$N after Hear is taller again after a louder Hear again"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep the existing Need \$N #claim hop"
grep -q 'data-hear-after-need-four' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Hear after Need \$N is re-concentrated again after a louder Need"
grep -q 'data-need-after-hear-four' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Need \$N after Hear is taller again after a louder Hear"
grep -q 'data-hear-after-need-three' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Hear after Need \$N is re-concentrated again"
grep -q 'data-need-after-hear-three' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Need \$N after Hear is taller again"
grep -q 'data-hear-after-need-two' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Hear after Need \$N is re-concentrated"
grep -q 'data-need-after-hear-two' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Need \$N after Hear is taller"
grep -q 'data-hear-after-need' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Hear after Need \$N"
grep -q 'data-need-after-hear' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Need \$N as the raise control"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep one first Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "hear-after-need-five cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "hear-after-need-five cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "hear-after-need-five hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "hear-after-need-five cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "hear-after-need-five cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "hear-after-need-five cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "hear-after-need-five cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "hear-after-need-five cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "hear-after-need-five cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "hear-after-need-five cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "hear-after-need-five cut must keep the station-desk columns"
grep -q '.need-after-hear' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Need \$N weight"
grep -q 'min-height: 2.15rem' src/app/board.css \
  || fail "Need \$N must stay a dashed raise control after Hear is re-concentrated again after a louder Need again"
grep -q 'border: 2px dashed' src/app/board.css \
  || fail "Need \$N must stay the dashed raise control, not a recolor"
grep -q '.need-after-hear.need-after-hear-two' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Need \$N size after Hear is taller"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Need \$N size after Hear is taller again"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three.need-after-hear-four' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Need \$N size after Hear is taller again after a louder Hear"
grep -q '.need-after-hear.need-after-hear-two.need-after-hear-three.need-after-hear-four.need-after-hear-five' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Need \$N size after Hear is taller again after a louder Hear again"
grep -q '.opening-listen.hear-after-need' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Hear size after Need \$N"
grep -q '.opening-listen.hear-after-need.hear-after-need-two' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Hear size after Need \$N is re-concentrated"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Hear size after Need \$N is re-concentrated again"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three.hear-after-need-four' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Hear size after Need \$N is re-concentrated again after a louder Need"
grep -q '.opening-listen.hear-after-need.hear-after-need-two.hear-after-need-three.hear-after-need-four.hear-after-need-five' src/app/board.css \
  || fail "hear-after-need-five cut must keep hop-local Hear size after Need \$N is re-concentrated again after a louder Need again"
if grep -A20 '.week-occupied .need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
need_after_hear_five_keep="$(awk '/^\.week-occupied \.need-after-hear\.need-after-hear-two\.need-after-hear-three\.need-after-hear-four\.need-after-hear-five \{/,/\}/' src/app/board.css)"
if echo "$need_after_hear_five_keep" | grep -q 'background:'; then
  fail "hear-after-need-five must not recolor Need \$N"
fi
if echo "$need_after_hear_five_keep" | grep -q 'border:'; then
  fail "hear-after-need-five must keep the existing dashed raise box, not restyle the border"
fi
hear_after_need_four_keep_prior="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four \{/,/\}/' src/app/board.css | awk 'NR==1 || !/hear-after-need-five/ {print} /hear-after-need-five/ {exit}')"
if echo "$hear_after_need_four_keep_prior" | grep -q 'background:'; then
  fail "hear-after-need-five must not recolor the prior Hear stamp"
fi
if echo "$hear_after_need_four_keep_prior" | grep -q 'border:'; then
  fail "hear-after-need-five must keep the existing filled Hear pill, not restyle the prior stamp"
fi
hear_after_need_five_rule="$(awk '/^\.week-occupied \.opening-listen\.hear-after-need\.hear-after-need-two\.hear-after-need-three\.hear-after-need-four\.hear-after-need-five \{/,/\}/' src/app/board.css)"
if echo "$hear_after_need_five_rule" | grep -q 'background:'; then
  fail "hear-after-need-five must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_five_rule" | grep -q 'border:'; then
  fail "hear-after-need-five must keep the existing filled Hear pill, not restyle the border"
fi
echo "$need_after_hear_five_keep" | grep -q 'min-height: 3.35rem' \
  || fail "hear-after-need-five must keep Need \$N at the re-concentrated-again raise size"
echo "$hear_after_need_four_keep_prior" | grep -q 'min-height: 3.65rem' \
  || fail "hear-after-need-five must keep the prior Hear size stamp"
echo "$hear_after_need_five_rule" | grep -q 'min-height: 3.95rem' \
  || fail "hear-after-need-five must make Hear taller than the re-concentrated-again Need \$N box"
echo "$hear_after_need_five_rule" | grep -q 'font-size: 1.42rem' \
  || fail "hear-after-need-five must make Hear type larger than the Need \$N raise box"
if echo "$hear_after_need_five_rule" | grep -q 'background:'; then
  fail "hear-after-need-five must concentrate Hear by size, not a recolor"
fi
if echo "$hear_after_need_five_rule" | grep -q 'border:'; then
  fail "hear-after-need-five must keep the existing Hear pill, not restyle the border"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "hear-after-need-five cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "hear-after-need-five cut must not revive the stays-dark empty week"
fi

echo "== UX: occupied #1 track title reads first and larger than \$bid =="
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "occupied #1 must mark prize before price so the track reads first"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "occupied #1 must mark the track title as the prize"
grep -q 'className="opening-track"' src/app/page.tsx \
  || fail "occupied #1 prize must stay the opening-track title"
grep -q 'occupied #1 track title reads first and larger than $bid and clicks' tests/product-ui.test.ts \
  || fail "product-ui tests must cover prize before price on occupied #1"
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'prize-before-price'; then
  fail "empty week must not stamp prize before price"
fi
if grep -n 'className="card"' -A 30 src/app/page.tsx | grep -q 'prize-before-price'; then
  fail "later ranks must not stamp prize before price"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "prize before price must not add a hear-after-need-N stamp"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "prize before price must not add a need-after-hear-N stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "prize before price must not add a second Hear hop"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "prize before price must not add a second Hear hop after the difference"
fi
grep -q 'data-hear-after-need-five' src/app/page.tsx \
  || fail "prize-before-price cut must keep one first Hear"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"' src/app/page.tsx \
  || fail "prize-before-price cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "prize-before-price cut must keep Need \$N after Hear"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "prize-before-price cut must keep the existing Need \$N #claim hop"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "prize-before-price cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "prize-before-price cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "prize-before-price cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "prize-before-price cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "prize-before-price cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "prize-before-price cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "prize-before-price cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "prize-before-price cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "prize-before-price cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "prize-before-price cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "prize-before-price cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "prize-before-price hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "prize-before-price cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "prize-before-price cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "prize-before-price cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "prize-before-price cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "prize-before-price cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "prize-before-price cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "prize-before-price cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "prize-before-price cut must keep the station-desk columns"
grep -q 'data-prize-before-price' src/app/board.css \
  || fail "prize-before-price CSS must enlarge occupied #1 title over \$bid"
grep -Fq 'clamp(2.85rem, 8vw, 4.4rem)' src/app/board.css \
  || fail "prize-before-price CSS must make the occupied title larger than \$bid"
if ! grep -n 'data-prize-before-price' -A 12 src/app/board.css | grep -q '0.86rem'; then
  fail "prize-before-price CSS must keep occupied \$bid quieter than the title"
fi
if ! grep -n 'data-prize-before-price' -A 16 src/app/board.css | grep -q '0.78rem'; then
  fail "prize-before-price CSS must keep occupied clicks quieter than the title"
fi
prize_title_rule="$(awk '/^\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track \{/,/\}/' src/app/board.css)"
echo "$prize_title_rule" | grep -q 'font-size: clamp(2.85rem, 8vw, 4.4rem)' \
  || fail "occupied title must be larger than \$bid + clicks"
if echo "$prize_title_rule" | grep -q 'background:'; then
  fail "prize-before-price must enlarge the title by size, not a recolor"
fi
prize_bid_rule="$(awk '/^\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.bid \{/,/\}/' src/app/board.css)"
echo "$prize_bid_rule" | grep -q 'font-size: 0.86rem' \
  || fail "occupied \$bid must stay a later quieter fact"
if echo "$prize_bid_rule" | grep -q 'background:'; then
  fail "prize-before-price must not recolor \$bid"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "prize-before-price cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "prize-before-price cut must not revive the stays-dark empty week"
fi

echo "== UX: empty week stays Bid USD / \$5 and does not invent Hear =="
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "empty week must stamp Bid USD / \$5 so occupied Hear cannot leak"
grep -q 'data-empty-bid-five' src/app/outbid-form.tsx \
  || fail "empty claim note must stamp Bid USD / \$5"
grep -q 'data-first-read="bid"' src/app/page.tsx \
  || fail "empty week must mark Bid USD as the first read"
grep -q 'empty week stays Bid USD / $5 and does not invent Hear' tests/product-ui.test.ts \
  || fail "product-ui tests must cover empty week staying Bid USD / \$5"
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Need \$'; then
  fail "empty week must not leak Need \$N"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'prize-before-price'; then
  fail "empty week must not stamp prize before price"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-prize'; then
  fail "empty week must not stamp a prize title"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "empty Bid USD / \$5 must not add a hear-after-need-N stamp"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "empty Bid USD / \$5 must not add a need-after-hear-N stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "empty Bid USD / \$5 must not add a second Hear hop"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "empty Bid USD / \$5 must not add a second Hear hop after the difference"
fi
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep occupied prize before price"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the occupied prize title"
grep -q 'data-hear-after-need-five' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep one first Hear on occupied weeks"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep Need \$N after Hear"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the existing Need \$N #claim hop"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep Hear as the first click when occupied"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the occupied raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep occupied Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must keep one hear path when occupied"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "empty Bid USD / \$5 hop must still use the click route"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must not undo the artist claim rail"
grep -q 'claims this week' src/app/outbid-form.tsx \
  || fail "empty Bid USD / \$5 cut must keep \$5 claims this week's opening song"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "empty Bid USD / \$5 cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "empty Bid USD / \$5 cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "empty Bid USD / \$5 cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "empty Bid USD / \$5 cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "empty Bid USD / \$5 cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "empty Bid USD / \$5 cut must keep the station-desk columns"
grep -Fq '.board[data-empty-bid-five]' src/app/board.css \
  || fail "empty Bid USD / \$5 CSS must hide occupied Hear / Need / prize on an empty week"
empty_bid_five_rule="$(awk '/^\.board\[data-empty-bid-five\] \.hear-after-raise,/,/^\}/' src/app/board.css)"
echo "$empty_bid_five_rule" | grep -q 'display: none' \
  || fail "empty Bid USD / \$5 CSS must hide occupied Hear / Need / prize"
if echo "$empty_bid_five_rule" | grep -q 'background:'; then
  fail "empty Bid USD / \$5 must hide occupied chrome, not recolor the desk"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "empty Bid USD / \$5 cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty Bid USD / \$5 cut must not revive the stays-dark empty week"
fi

echo "== UX: occupied #1 playback is real and does not invent play counts =="
grep -q 'data-real-playback' src/app/page.tsx \
  || fail "occupied #1 must stamp real playback so play counts cannot invent a stream"
grep -q 'data-clicks-are-hops' src/app/page.tsx \
  || fail "occupied #1 must stamp clicks as hops, not plays"
grep -q 'data-stored-listen' src/app/page.tsx \
  || fail "hop #1 must stamp the stored listen URL as the playback target"
grep -q 'hops, not a platform count' src/app/page.tsx \
  || fail "occupied #1 must say clicks are hops, not a platform count"
grep -q 'occupied #1 playback is real and does not invent play counts' tests/product-ui.test.ts \
  || fail "product-ui tests must cover real playback without invented play counts"
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-real-playback'; then
  fail "empty week must not stamp real playback"
fi
if grep -n 'className="card"' -A 30 src/app/page.tsx | grep -q 'data-real-playback'; then
  fail "later ranks must not stamp real playback"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "real playback must not add a hear-after-need-N stamp"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "real playback must not add a need-after-hear-N stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "real playback must not add a second Hear hop"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "real playback must not add a second Hear hop after the difference"
fi
if grep -RInEi '1\.2M streams|monthly listeners|waveform|<audio' \
  src/app/page.tsx src/app/layout.tsx src/app/outbid-form.tsx src/app/board.css
then
  fail "real playback must not invent play counts or a fake stream"
fi
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "real playback cut must keep empty week as Bid USD / \$5"
grep -q 'data-first-read="bid"' src/app/page.tsx \
  || fail "real playback cut must keep empty Bid USD as the first read"
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "real playback cut must keep occupied prize before price"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "real playback cut must keep the occupied prize title"
grep -q 'data-hear-after-need-five' src/app/page.tsx \
  || fail "real playback cut must keep one first Hear"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"' src/app/page.tsx \
  || fail "real playback cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "real playback cut must keep Need \$N after Hear"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "real playback cut must keep the existing Need \$N #claim hop"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "real playback cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "real playback cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "real playback cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "real playback cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "real playback cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "real playback cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "real playback cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "real playback cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "real playback cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "real playback cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "real playback cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "real playback hop must still use the click route"
grep -q 'playbackForListing' src/app/page.tsx \
  || fail "real playback must still use stored listen URL playback"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "real playback cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "real playback cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "real playback cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "real playback cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "real playback cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "real playback cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "real playback cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "real playback cut must keep the station-desk columns"
grep -q 'data-real-playback' src/app/board.css \
  || fail "real playback CSS must concentrate occupied stored-URL playback"
grep -q 'data-clicks-are-hops' src/app/board.css \
  || fail "real playback CSS must hide hop-count chrome on an empty week"
real_player_rule="$(awk '/^\.week-occupied \.studio-deck\[data-real-playback\] \.player \{/,/\}/' src/app/board.css)"
echo "$real_player_rule" | grep -q 'min-height: 16.5rem' \
  || fail "real playback must make the official embed taller than the decorative player box"
if echo "$real_player_rule" | grep -q 'background:'; then
  fail "real playback must concentrate the player by size, not a recolor"
fi
hop_host_rule="$(awk '/^\.week-occupied \.studio-deck\[data-real-playback="hop"\] \.hear-row \.listen-host \{/,/\}/' src/app/board.css)"
echo "$hop_host_rule" | grep -q 'font-size: 0.92rem' \
  || fail "hop #1 must make the stored host larger than a decorative hostname"
if echo "$hop_host_rule" | grep -q 'background:'; then
  fail "real playback must not recolor the hop host"
fi
click_note_rule="$(awk '/^\.week-occupied \.studio-deck\[data-real-playback\] \.click-note \{/,/\}/' src/app/board.css)"
echo "$click_note_rule" | grep -q 'font-size: 0.72rem' \
  || fail "occupied clicks must stay quieter hops, not a play count"
if echo "$click_note_rule" | grep -q 'background:'; then
  fail "real playback must not recolor the click note"
fi
empty_real_rule="$(awk '/^\.board\[data-empty-bid-five\] \.hear-after-raise,/,/^\}/' src/app/board.css)"
echo "$empty_real_rule" | grep -q 'data-real-playback' \
  || fail "empty Bid USD / \$5 CSS must hide occupied real playback"
echo "$empty_real_rule" | grep -q 'display: none' \
  || fail "empty Bid USD / \$5 CSS must keep occupied Hear / Need / playback off empty"
if echo "$empty_real_rule" | grep -q 'background:'; then
  fail "real playback must hide occupied chrome on empty, not recolor the desk"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "real playback cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "real playback cut must not revive the stays-dark empty week"
fi

echo "== UX: occupied #1 \$bid stays a later fact beside the song title =="
grep -q 'data-later-fact' src/app/page.tsx \
  || fail "occupied #1 must stamp \$bid as a later fact so it cannot shout beside the title"
grep -q 'later-fact' src/app/page.tsx \
  || fail "occupied #1 \$bid must use the later-fact class"
grep -q 'className="opening-facts later-fact"' src/app/page.tsx \
  || fail "occupied #1 \$bid + hops must recede together as later facts"
grep -q 'className="bid later-fact"' src/app/page.tsx \
  || fail "occupied #1 \$bid must stay a later fact on the studio deck"
grep -q 'className="clicks later-fact"' src/app/page.tsx \
  || fail "occupied #1 hop counts must stay a later fact beside \$bid"
grep -q 'occupied #1 $bid stays a later fact and does not shout beside the song title' tests/product-ui.test.ts \
  || fail "product-ui tests must cover occupied \$bid staying a later fact"
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'later-fact'; then
  fail "empty week must not stamp later-fact \$bid"
fi
if grep -n 'className="card"' -A 30 src/app/page.tsx | grep -q 'later-fact'; then
  fail "later ranks must not stamp later-fact \$bid"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "later-fact cut must not invent a Hear hop on empty"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "later-fact \$bid must not add a hear-after-need-N stamp"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "later-fact \$bid must not add a need-after-hear-N stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "later-fact \$bid must not add a second Hear hop"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "later-fact \$bid must not add a second Hear hop after the difference"
fi
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "later-fact cut must keep occupied prize before price"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "later-fact cut must keep the occupied prize title"
grep -q 'data-real-playback' src/app/page.tsx \
  || fail "later-fact cut must keep occupied real playback"
grep -q 'data-clicks-are-hops' src/app/page.tsx \
  || fail "later-fact cut must keep occupied clicks as hops"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "later-fact cut must keep empty week as Bid USD / \$5"
grep -q 'data-first-read="bid"' src/app/page.tsx \
  || fail "later-fact cut must keep empty Bid USD as the first read"
grep -q 'data-hear-after-need-five' src/app/page.tsx \
  || fail "later-fact cut must keep one first Hear"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"' src/app/page.tsx \
  || fail "later-fact cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "later-fact cut must keep Need \$N after Hear"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "later-fact cut must keep the existing Need \$N #claim hop"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "later-fact cut must keep Hear as the first click"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "later-fact cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "later-fact cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "later-fact cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "later-fact cut must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "later-fact cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "later-fact cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "later-fact cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "later-fact cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "later-fact cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "later-fact cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "later-fact hop must still use the click route"
grep -q 'playbackForListing' src/app/page.tsx \
  || fail "later-fact cut must still use stored listen URL playback"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "later-fact cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "later-fact cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "later-fact cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "later-fact cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "later-fact cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "later-fact cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "later-fact cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "later-fact cut must keep the station-desk columns"
grep -q 'data-later-fact' src/app/board.css \
  || fail "later-fact CSS must mute occupied \$bid beside the title"
grep -Fq '.week-occupied .studio-deck[data-prize-before-price] .opening-facts.later-fact[data-later-fact]' src/app/board.css \
  || fail "later-fact CSS must target occupied #1 facts as later facts"
grep -Fq '.week-occupied .studio-deck[data-prize-before-price] .opening-facts .bid.later-fact[data-later-fact]' src/app/board.css \
  || fail "later-fact CSS must target occupied #1 \$bid only"
grep -Fq '.week-occupied .studio-deck[data-prize-before-price] .opening-facts .clicks.later-fact[data-later-fact]' src/app/board.css \
  || fail "later-fact CSS must target occupied #1 hop counts only"
later_facts_rule="$(awk '/^\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts\.later-fact\[data-later-fact\] \{/,/\}/' src/app/board.css)"
echo "$later_facts_rule" | grep -q 'font-weight: 500' \
  || fail "occupied facts must recede together as later facts"
if echo "$later_facts_rule" | grep -q 'background:'; then
  fail "later-fact facts must recede by weight, not a recolor of the desk"
fi
later_bid_rule="$(awk '/^\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-facts \.bid\.later-fact\[data-later-fact\],/,/\}/' src/app/board.css)"
echo "$later_bid_rule" | grep -q 'color: var(--muted)' \
  || fail "occupied \$bid must mute to later-fact ink, not shout primary beside the title"
echo "$later_bid_rule" | grep -q 'font-weight: 500' \
  || fail "occupied \$bid must stay a quieter later fact, not a bold prize"
echo "$later_bid_rule" | grep -q 'clicks.later-fact' \
  || fail "occupied hop counts must mute with \$bid as later facts"
if echo "$later_bid_rule" | grep -q 'color: var(--primary)'; then
  fail "later-fact \$bid must not keep primary shout beside the title"
fi
if echo "$later_bid_rule" | grep -q 'background:'; then
  fail "later-fact \$bid must mute by weight and ink, not a recolor of the desk"
fi
prize_title_keep="$(awk '/^\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track \{/,/\}/' src/app/board.css)"
echo "$prize_title_keep" | grep -q 'font-size: clamp(2.85rem, 8vw, 4.4rem)' \
  || fail "later-fact cut must keep the occupied title larger than \$bid"
if echo "$prize_title_keep" | grep -q 'background:'; then
  fail "later-fact cut must not recolor the occupied title"
fi
empty_later_rule="$(awk '/^\.board\[data-empty-bid-five\] \.hear-after-raise,/,/^\}/' src/app/board.css)"
echo "$empty_later_rule" | grep -q 'data-later-fact' \
  || fail "empty Bid USD / \$5 CSS must hide occupied later-fact \$bid"
echo "$empty_later_rule" | grep -q 'display: none' \
  || fail "empty Bid USD / \$5 CSS must keep occupied Hear / Need / prize / later-fact off empty"
if echo "$empty_later_rule" | grep -q 'background:'; then
  fail "later-fact cut must hide occupied chrome on empty, not recolor the desk"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "later-fact cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "later-fact cut must not revive the stays-dark empty week"
fi

echo "== UX: empty week stays Bid USD / \$5 — song-prize / Hear cannot leak =="
grep -q 'board station week-empty' src/app/page.tsx \
  || fail "empty week must wrap in week-empty so occupied Hear / song-prize cannot leak"
grep -q 'board station week-occupied' src/app/page.tsx \
  || fail "occupied week must wrap in week-occupied so Hear / prize CSS stay scoped"
grep -q 'data-week-empty' src/app/page.tsx \
  || fail "empty week must stamp data-week-empty"
grep -q 'data-week-occupied' src/app/page.tsx \
  || fail "occupied week must stamp data-week-occupied"
grep -q 'empty week stays Bid USD / $5 — song-prize / Hear cannot leak' tests/product-ui.test.ts \
  || fail "product-ui tests must cover empty week isolation so song-prize / Hear cannot leak"
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Need \$'; then
  fail "empty week must not leak Need \$N"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'prize-before-price'; then
  fail "empty week must not stamp prize before price"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-prize'; then
  fail "empty week must not stamp a prize title"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'later-fact'; then
  fail "empty week must not stamp later-fact \$bid"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-real-playback'; then
  fail "empty week must not stamp real playback"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "empty isolation must not add a hear-after-need-N stamp"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "empty isolation must not add a need-after-hear-N stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "empty isolation must not add a second Hear hop"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "empty isolation must not add a second Hear hop after the difference"
fi
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "empty isolation must keep Bid USD / \$5"
grep -q 'data-first-read="bid"' src/app/page.tsx \
  || fail "empty isolation must keep Bid USD as the first read"
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "empty isolation must keep occupied prize before price"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "empty isolation must keep the occupied prize title"
grep -q 'data-later-fact' src/app/page.tsx \
  || fail "empty isolation must keep occupied later-fact \$bid"
grep -q 'data-real-playback' src/app/page.tsx \
  || fail "empty isolation must keep occupied real playback"
grep -q 'data-hear-after-need-five' src/app/page.tsx \
  || fail "empty isolation must keep one first Hear on occupied weeks"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"' src/app/page.tsx \
  || fail "empty isolation must keep the existing first Hear hop"
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "empty isolation must keep Need \$N after Hear"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "empty isolation must keep the existing Need \$N #claim hop"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "empty isolation must keep Hear as the first click when occupied"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "empty isolation must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "empty isolation must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "empty isolation must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "empty isolation must keep the Hear hop above Need \$N"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "empty isolation must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "empty isolation must keep the occupied raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "empty isolation must keep occupied Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "empty isolation must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "empty isolation must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "empty isolation must keep one hear path when occupied"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "empty isolation hop must still use the click route"
grep -q 'playbackForListing' src/app/page.tsx \
  || fail "empty isolation must still use stored listen URL playback"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "empty isolation must not undo the artist claim rail"
grep -q 'claims this week' src/app/outbid-form.tsx \
  || fail "empty isolation must keep \$5 claims this week's opening song"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "empty isolation must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "empty isolation must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "empty isolation must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "empty isolation must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "empty isolation must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "empty isolation must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "empty isolation must keep the station-desk columns"
grep -Fq '.week-empty[data-empty-bid-five] [data-hear-opening]' src/app/board.css \
  || fail "empty week shell must hide leaked Hear chrome"
grep -Fq '.week-empty[data-empty-bid-five] [data-prize]' src/app/board.css \
  || fail "empty week shell must hide leaked song-prize chrome"
grep -Fq '.week-empty[data-empty-bid-five] [data-later-fact]' src/app/board.css \
  || fail "empty week shell must hide leaked later-fact \$bid"
grep -Fq '.week-empty[data-empty-bid-five] [data-real-playback]' src/app/board.css \
  || fail "empty week shell must hide leaked real playback"
grep -Fq '.week-empty .opening-listen' src/app/board.css \
  || fail "empty week shell must hide leaked Hear pills"
grep -Fq '.week-empty .need-after-hear' src/app/board.css \
  || fail "empty week shell must hide leaked Need \$N chrome"
grep -Fq '.week-empty .player' src/app/board.css \
  || fail "empty week shell must hide leaked player chrome"
grep -Fq '.week-occupied .empty-deck' src/app/board.css \
  || fail "occupied week shell must hide empty-deck chrome"
grep -Fq '.week-occupied .opening-listen {' src/app/board.css \
  || fail "Hear pill CSS must be scoped to week-occupied"
grep -Fq '.week-occupied .need-after-hear {' src/app/board.css \
  || fail "Need \$N CSS must be scoped to week-occupied"
grep -Fq '.week-occupied .studio-deck[data-prize-before-price] .opening-track' src/app/board.css \
  || fail "song-prize CSS must be scoped to week-occupied"
grep -Fq '.week-occupied .studio-deck[data-real-playback] .player' src/app/board.css \
  || fail "real playback CSS must be scoped to week-occupied"
if grep -E '^\.opening-listen \{' src/app/board.css; then
  fail "Hear pill CSS must not apply outside week-occupied"
fi
if grep -E '^\.need-after-hear \{' src/app/board.css; then
  fail "Need \$N CSS must not apply outside week-occupied"
fi
if grep -E '^\.studio-deck\[data-prize-before-price\]' src/app/board.css; then
  fail "song-prize CSS must not apply outside week-occupied"
fi
if grep -E '^\.studio-deck\[data-real-playback\]' src/app/board.css; then
  fail "real playback CSS must not apply outside week-occupied"
fi
empty_no_hear_rule="$(awk '/^\.board\[data-empty-bid-five\] \.hear-after-raise,/,/^\}/' src/app/board.css)"
echo "$empty_no_hear_rule" | grep -q 'display: none' \
  || fail "empty week CSS must hide occupied Hear / Need / prize"
echo "$empty_no_hear_rule" | grep -q 'week-empty\[data-empty-bid-five\] \[data-hear-opening\]' \
  || fail "empty week CSS must hide leaked Hear on the week-empty shell"
echo "$empty_no_hear_rule" | grep -q 'week-empty \.player' \
  || fail "empty week CSS must hide leaked player chrome on the week-empty shell"
if echo "$empty_no_hear_rule" | grep -q 'background:'; then
  fail "empty isolation must hide occupied chrome, not recolor the desk"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "empty isolation must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty isolation must not revive the stays-dark empty week"
fi

echo "== UX: occupied Hear is the first click — Need \$N is not a muted twin =="
grep -q 'occupied Hear is the first click — Need $N is not a muted twin' tests/product-ui.test.ts \
  || fail "product-ui tests must cover Need \$N receding by grouping, not a muted twin"
grep -q 'className="claim-rail"' src/app/page.tsx \
  || fail "Need \$N grouping must keep the existing claim rail"
grep -q 'className="raise-after-hear"' src/app/page.tsx \
  || fail "Need \$N must stay the existing raise hop, grouped with Claim"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "Need \$N must stay the existing #claim hop, not a second Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "Hear must stay the first occupied click"
grep -q 'data-hear-one-first' src/app/page.tsx \
  || fail "one first Hear must stay"
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "occupied song title must stay the prize"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "occupied prize title must stay"
grep -q 'data-later-fact' src/app/page.tsx \
  || fail "occupied \$bid must stay a later fact"
grep -q 'data-real-playback' src/app/page.tsx \
  || fail "occupied playback must stay real"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "empty week must stay Bid USD / \$5"
grep -q 'data-first-read="bid"' src/app/page.tsx \
  || fail "empty week must keep Bid USD as the first read"
grep -q 'data-hear-after-need-five' src/app/page.tsx \
  || fail "Need-not-twin cut must keep one first Hear hop"
grep -q 'className="listen opening-listen hear-after-need hear-after-need-two hear-after-need-three hear-after-need-four hear-after-need-five"' src/app/page.tsx \
  || fail "Need-not-twin cut must keep the existing first Hear hop"
grep -q 'data-need-after-hear-five' src/app/page.tsx \
  || fail "Need-not-twin cut must keep Need \$N after Hear"
grep -q 'data-raise-note' src/app/page.tsx \
  || fail "Need-not-twin cut must keep the named raise difference"
grep -q 'Same listen URL pays only the difference' src/app/page.tsx \
  || fail "Need-not-twin cut must keep same listen URL pays only the difference"
grep -q 'data-raise-after-hear-first' src/app/page.tsx \
  || fail "Need-not-twin cut must keep raise after Hear-first"
grep -q 'data-hear-after-raise' src/app/page.tsx \
  || fail "Need-not-twin cut must keep the Hear hop"
grep -q 'data-raise-after-hear' src/app/page.tsx \
  || fail "Need-not-twin cut must keep the Need \$N hop"
grep -q 'href="#claim"' src/app/page.tsx \
  || fail "Need-not-twin cut must keep the raise hop to #claim"
grep -q 'Need ' src/app/page.tsx \
  || fail "Need-not-twin cut must keep Need \$N to take #1"
grep -q 'data-first-read="hear"' src/app/page.tsx \
  || fail "Need-not-twin cut must keep occupied listen as the first read"
grep -q "opening song is on" src/app/page.tsx \
  || fail "Need-not-twin cut must keep the occupied hear lede"
grep -q 'data-hear-opening' src/app/page.tsx \
  || fail "Need-not-twin cut must keep one hear path"
grep -q 'listenClickPath' src/app/page.tsx \
  || fail "Need-not-twin hop must still use the click route"
grep -q 'playbackForListing' src/app/page.tsx \
  || fail "Need-not-twin cut must still use stored listen URL playback"
grep -q 'data-claim-opening' src/app/page.tsx \
  || fail "Need-not-twin cut must not undo the artist claim rail"
grep -q 'pays only the difference' src/app/outbid-form.tsx \
  || fail "Need-not-twin cut must leave the same-listen-URL difference on the rail"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "Need-not-twin cut must leave Claim #1 on the rail"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "Need-not-twin cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "Need-not-twin cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "Need-not-twin cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "Need-not-twin cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "Need-not-twin cut must keep the station-desk columns"
grep -Fq '.week-occupied .claim-rail .raise-after-hear' src/app/board.css \
  || fail "Need \$N grouping CSS must target the claim rail, not mute the Hear twin"
if grep -q 'data-need-later-quiet' src/app/page.tsx src/app/board.css; then
  fail "Need-not-twin must not restamp PR #35 mute (data-need-later-quiet)"
fi
if grep -q 'need-later-quiet' src/app/page.tsx src/app/board.css; then
  fail "Need-not-twin must not restamp PR #35 mute (need-later-quiet)"
fi
if grep -q 'data-hear-after-need-six' src/app/page.tsx; then
  fail "Need-not-twin must not add a hear-after-need-N stamp"
fi
if grep -q 'data-need-after-hear-six' src/app/page.tsx; then
  fail "Need-not-twin must not add a need-after-hear-N stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "Need-not-twin must not add a second Hear hop after the difference"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "Need-not-twin must not add a second Hear hop after the difference"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'raise-after-hear'; then
  fail "empty week must not group Need \$N on the empty deck"
fi
if grep -n 'data-first-click="hear"' -A 16 src/app/page.tsx | grep -q 'className="raise-after-hear"'; then
  fail "Hear must not keep Need \$N as a sibling hop"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Need \$'; then
  fail "empty week must not leak Need \$N"
fi
hear_block="$(awk '/<p className="hear-after-raise">/,/<\/p>/' src/app/page.tsx)"
echo "$hear_block" | grep -q 'data-first-click="hear"' \
  || fail "Hear must stay the first occupied click"
if echo "$hear_block" | grep -q 'className="raise-after-hear"'; then
  fail "Need \$N is still a sibling of Hear"
fi
if echo "$hear_block" | grep -q 'Need {formatUsd'; then
  fail "Need \$N is still a sibling of Hear"
fi
rail_block="$(awk '/className="claim-rail"/,/<\/aside>/' src/app/page.tsx)"
echo "$rail_block" | grep -q 'className="raise-after-hear"' \
  || fail "Need \$N must be grouped inside the claim rail"
echo "$rail_block" | grep -q 'Need {formatUsd(defaultAmount)} to take #1' \
  || fail "Need \$N copy must live in the claim-rail group"
echo "$rail_block" | grep -q 'href="#claim"' \
  || fail "Need \$N must still hop to #claim"
if echo "$rail_block" | grep -q 'data-first-click="hear"'; then
  fail "Hear must not move into the claim rail"
fi
if echo "$rail_block" | grep -q 'Hear this week'; then
  fail "Hear copy must not live in the claim rail"
fi
empty_deck="$(awk '/if \(!listing\) \{/,/^  \}$/' src/app/page.tsx)"
if echo "$empty_deck" | grep -q 'raise-after-hear'; then
  fail "empty week must not group Need \$N"
fi
if echo "$empty_deck" | grep -q 'Need {formatUsd'; then
  fail "empty week must not group Need \$N"
fi
need_group_rule="$(awk '/^\.week-occupied \.claim-rail \.raise-after-hear \{/,/\}/' src/app/board.css)"
echo "$need_group_rule" | grep -q 'margin: 0 0 0.85rem' \
  || fail "Need \$N grouping CSS must recede by placement in the claim rail"
if echo "$need_group_rule" | grep -q 'background:'; then
  fail "Need \$N grouping must not recolor the hop"
fi
if echo "$need_group_rule" | grep -q 'color: var(--muted)'; then
  fail "Need \$N grouping must not mute the hop (PR #35 REJECT)"
fi
if echo "$need_group_rule" | grep -q 'font-size:'; then
  fail "Need \$N grouping must not restyle type as a quieter twin"
fi
need_hop_keep="$(awk '/^\.week-occupied \.need-after-hear \{/,/\}/' src/app/board.css)"
echo "$need_hop_keep" | grep -q 'border: 2px dashed' \
  || fail "Need \$N must keep the existing dashed raise box"
echo "$need_hop_keep" | grep -q 'background: transparent' \
  || fail "Need \$N must stay a dashed write, not a filled Hear twin"
if echo "$need_hop_keep" | grep -q 'color: var(--muted)'; then
  fail "Need \$N hop must not mute to --muted (PR #35 REJECT)"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "Need-not-twin cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "Need-not-twin cut must not revive the stays-dark empty week"
fi

echo "== UX: empty week has one first click — Claim #1, then the listen URL =="
grep -q 'empty week has one first click — Claim #1, then the listen URL' tests/product-ui.test.ts \
  || fail "product-ui tests must cover empty week one first click: Claim #1 then listen URL"
grep -q 'empty-claim-first' src/app/outbid-form.tsx \
  || fail "empty Claim #1 must use the empty-claim-first class"
grep -q 'data-empty-claim-first' src/app/outbid-form.tsx \
  || fail "empty Claim #1 must stamp data-empty-claim-first"
grep -q 'data-first-click="claim"' src/app/outbid-form.tsx \
  || fail "empty Claim #1 Outbid must win the first click"
grep -q 'data-later-write' src/app/outbid-form.tsx \
  || fail "empty week must stamp the listen URL as a later write"
grep -q 'data-listen-identity' src/app/outbid-form.tsx \
  || fail "empty week must wrap Track / Artist / Listen URL as listing identity"
grep -q 'Then the listen URL' src/app/outbid-form.tsx \
  || fail "empty week must name the listen URL as a later write"
grep -q 'EmptyClaimFirstWrite' src/app/outbid-form.tsx \
  || fail "empty week must compose Claim #1 before the listen URL"
grep -q 'OccupiedListingWrite' src/app/outbid-form.tsx \
  || fail "occupied claim must keep listing fields on the rail with Outbid"
grep -q 'Empty week: Listen URL is a later write after Claim #1 / Outbid' src/app/board.css \
  || fail "empty CSS must name the listen URL as a later write after Claim #1"
grep -Fq '.week-empty .claim.empty-claim-first[data-empty-claim-first] .listen-identity[data-later-write]' src/app/board.css \
  || fail "empty CSS must compose later-write identity off the claim rail"
grep -Fq '.week-empty .claim.empty-claim-first[data-empty-claim-first] .later-write-label' src/app/board.css \
  || fail "empty CSS must label the later listen URL write"
grep -Fq '.week-empty .claim.empty-claim-first[data-empty-claim-first] .outbid[data-first-click="claim"]' src/app/board.css \
  || fail "empty CSS must make Claim #1 Outbid the first click"
grep -Fq '.week-occupied .claim .listen-identity[data-later-write]' src/app/board.css \
  || fail "occupied week must hide empty later-write identity"
grep -Fq '.week-occupied .claim [data-first-click="claim"]' src/app/board.css \
  || fail "occupied week must hide empty Claim #1 first-click"
grep -q 'Then the listen URL' tests/product-ui.test.ts \
  || fail "product-ui tests must name the later listen URL write"
grep -q 'data-first-click="claim"' tests/product-ui.test.ts \
  || fail "product-ui tests must stamp empty Claim #1 as the first click"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "empty one-first cut must keep Claim #1"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "empty one-first cut must keep the dashed amount"
grep -q 'className="step"' src/app/outbid-form.tsx \
  || fail "empty one-first cut must keep ± steppers"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "empty one-first cut must keep Outbid"
grep -q 'name="track"' src/app/outbid-form.tsx \
  || fail "empty one-first cut must keep Track"
grep -q 'name="artist"' src/app/outbid-form.tsx \
  || fail "empty one-first cut must keep Artist"
grep -q 'name="listenUrl"' src/app/outbid-form.tsx \
  || fail "empty one-first cut must keep the listen URL field as a later write"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "empty one-first cut must keep Hear as the first occupied click"
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "empty one-first cut must keep occupied song title as the prize"
grep -q 'data-later-fact' src/app/page.tsx \
  || fail "empty one-first cut must keep occupied \$bid as a later fact"
grep -q 'className="raise-after-hear"' src/app/page.tsx \
  || fail "empty one-first cut must keep Need \$N grouped with Claim"
grep -q 'className="need-after-hear need-after-hear-two need-after-hear-three need-after-hear-four need-after-hear-five"' src/app/page.tsx \
  || fail "empty one-first cut must keep the existing Need \$N #claim hop"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "empty one-first cut must keep Bid USD / \$5"
grep -q 'data-first-read="bid"' src/app/page.tsx \
  || fail "empty one-first cut must keep Bid USD as the first read"
grep -q 'station-desk' src/app/page.tsx \
  || fail "empty one-first cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "empty one-first cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "empty one-first cut must keep the station-desk columns"
grep -Fq '.week-occupied .claim-rail .raise-after-hear' src/app/board.css \
  || fail "empty one-first cut must keep Need \$N grouped on the occupied claim rail"
if grep -qE 'data-hear-after-need-six|data-need-after-hear-six' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty later-write must not add another numbered hop stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "empty one-first must not add a second Hear hop"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "empty one-first must not add a second Hear hop after the difference"
fi
if grep -q 'data-need-later-quiet' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty one-first must not restamp PR #35 mute"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Need \$'; then
  fail "empty week must not leak Need \$N"
fi
if grep -q 'data-first-click="hear"' src/app/outbid-form.tsx; then
  fail "empty Claim #1 must not steal occupied Hear as the first click"
fi
if awk '/function OccupiedListingWrite/,/function EmptyClaimFirstWrite/' src/app/outbid-form.tsx | grep -q 'data-first-click="claim"'; then
  fail "occupied claim must not stamp empty Claim #1 as the first click"
fi
if awk '/function OccupiedListingWrite/,/function EmptyClaimFirstWrite/' src/app/outbid-form.tsx | grep -q 'Then the listen URL'; then
  fail "occupied claim must not name a later listen URL write"
fi
if awk '/function OccupiedListingWrite/,/function EmptyClaimFirstWrite/' src/app/outbid-form.tsx | grep -q 'data-later-write'; then
  fail "occupied listing fields must stay on the claim rail with Outbid"
fi
if ! awk '
  /function EmptyClaimFirstWrite/ { empty=NR }
  empty && /data-first-click="claim"/ { click=NR }
  empty && /Then the listen URL/ { label=NR }
  empty && /ListingIdentityFields/ { ident=NR }
  END { exit !(empty && click && label && ident && empty < click && click < label && label < ident) }
' src/app/outbid-form.tsx; then
  fail "empty Claim #1 / Outbid must precede the later listen URL write"
fi
if ! awk '
  /function OccupiedListingWrite/ { occ=NR }
  occ && /ListingIdentityFields/ && !fields { fields=NR }
  occ && /Outbid/ && !row { row=NR }
  /function EmptyClaimFirstWrite/ { empty=NR }
  END { exit !(occ && fields && row && empty && occ < fields && fields < row && row < empty) }
' src/app/outbid-form.tsx; then
  fail "occupied claim must keep listing fields before Outbid"
fi
claim_first_rule="$(awk '/^\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.outbid\[data-first-click="claim"\] \{/,/\}/' src/app/board.css)"
echo "$claim_first_rule" | grep -q 'min-height: 2.75rem' \
  || fail "empty Claim #1 Outbid must win the first click by size"
if echo "$claim_first_rule" | grep -q 'background:'; then
  fail "empty one-first must concentrate Claim #1 by size, not a recolor"
fi
later_write_rule="$(awk '/^\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.listen-identity\[data-later-write\] \{/,/\}/' src/app/board.css)"
echo "$later_write_rule" | grep -q 'border-top: 1px dashed var(--line)' \
  || fail "empty later write must sit after Claim #1, not beside it"
if echo "$later_write_rule" | grep -q 'background:'; then
  fail "empty later write must recede by placement, not a recolor"
fi
later_label_rule="$(awk '/^\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.later-write-label \{/,/\}/' src/app/board.css)"
echo "$later_label_rule" | grep -q 'color: var(--muted)' \
  || fail "empty later-write label must recede after Claim #1"
if echo "$later_label_rule" | grep -q 'background:'; then
  fail "empty later-write label must not recolor"
fi
later_input_rule="$(awk '/^\.week-empty \.claim\.empty-claim-first\[data-empty-claim-first\] \.listen-identity\[data-later-write\] input \{/,/\}/' src/app/board.css)"
echo "$later_input_rule" | grep -q 'height: 2.2rem' \
  || fail "empty later write inputs must be shorter than Claim #1"
if echo "$later_input_rule" | grep -q 'background:'; then
  fail "empty later write must not recolor listing inputs"
fi
need_group_keep="$(awk '/^\.week-occupied \.claim-rail \.raise-after-hear \{/,/\}/' src/app/board.css)"
echo "$need_group_keep" | grep -q 'margin: 0 0 0.85rem' \
  || fail "empty one-first cut must keep Need \$N grouped with Claim"
if echo "$need_group_keep" | grep -q 'background:'; then
  fail "empty one-first cut must not recolor occupied Need \$N"
fi
if ! awk '
  /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track/ { prize=NR }
  /\.week-occupied \.opening-listen \{/ { hear=NR }
  /\.week-occupied \.claim-rail \.raise-after-hear/ { need=NR }
  /Empty week: Listen URL is a later write after Claim #1 \/ Outbid/ { later=NR }
  END { exit !(prize && hear && need && later && prize < later && hear < later && need < later) }
' src/app/board.css; then
  fail "empty later-write CSS must sit after occupied prize / Hear / Need grouping"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "empty one-first cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty one-first cut must not revive the stays-dark empty week"
fi

echo "== UX: occupied later tracks stay quieter than the opening song — prize stays first =="
grep -q 'occupied later tracks stay quieter than the opening song — prize stays first' tests/product-ui.test.ts \
  || fail "product-ui tests must cover later tracks quieter than the opening song"
grep -q 'data-later-stack' src/app/page.tsx \
  || fail "occupied later ranks must group after the opening song"
grep -q 'data-later-rank' src/app/page.tsx \
  || fail "occupied later ranks must stamp later-rank cards"
grep -q 'data-later-track' src/app/page.tsx \
  || fail "later-rank track names must sit on later-track, not the #1 prize title"
grep -q 'className="card later-card"' src/app/page.tsx \
  || fail "later-rank cards must use later-card anatomy, not #1 prize chrome"
grep -q 'className="queue later-stack"' src/app/page.tsx \
  || fail "later ranks must group in a later-stack, not share the studio deck"
grep -q 'className="listen later-listen"' src/app/page.tsx \
  || fail "later Listen must stay a later hop, not Hear"
grep -q 'data-listen-later' src/app/page.tsx \
  || fail "later Listen must stamp the later hop"
grep -q 'These tracks are not the opening song' src/app/page.tsx \
  || fail "later stack must name later tracks as not the opening song"
grep -q 'later-track\[data-later-track\]' src/app/board.css \
  || fail "later-rank CSS must style later-track, not mute opening-track"
grep -q 'later-card\[data-later-rank\]' src/app/board.css \
  || fail "later-rank CSS must target later-card anatomy"
grep -q 'listen.later-listen\[data-listen-later\]' src/app/board.css \
  || fail "later-rank CSS must keep later Listen quieter than Hear"
grep -Fq '.week-occupied .later-stack[data-later-stack] .later-card[data-later-rank] .later-track[data-later-track]' src/app/board.css \
  || fail "later-rank CSS must target later-track on later-card, not the prize title"
grep -Fq 'font-size: 0.92rem' src/app/board.css \
  || fail "later-rank titles must read smaller than the occupied opening song"
grep -Fq 'clamp(2.85rem, 8vw, 4.4rem)' src/app/board.css \
  || fail "later-rank cut must keep the occupied title larger than later tracks"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "later-rank cut must keep the occupied prize title"
grep -q 'data-prize-before-price' src/app/page.tsx \
  || fail "later-rank cut must keep occupied prize before price"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "later-rank cut must keep Hear as the first occupied click"
grep -q 'className="raise-after-hear"' src/app/page.tsx \
  || fail "later-rank cut must keep Need \$N grouped with Claim"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "later-rank cut must keep empty week as Bid USD / \$5"
grep -q 'data-first-read="bid"' src/app/page.tsx \
  || fail "later-rank cut must keep empty Bid USD as the first read"
grep -q 'data-first-click="claim"' src/app/outbid-form.tsx \
  || fail "later-rank cut must keep empty Claim #1 as the first click"
grep -q 'data-later-write' src/app/outbid-form.tsx \
  || fail "later-rank cut must keep empty listen URL as a later write"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "later-rank cut must keep Claim #1"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "later-rank cut must keep the dashed amount"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "later-rank cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "later-rank cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "later-rank cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "later-rank cut must keep the station-desk columns"
grep -Fq '.week-occupied .claim-rail .raise-after-hear' src/app/board.css \
  || fail "later-rank cut must keep Need \$N grouped on the occupied claim rail"
grep -Fq '.board[data-empty-bid-five] [data-later-rank]' src/app/board.css \
  || fail "empty week CSS must hide leaked later-rank chrome"
grep -Fq '.week-empty [data-later-track]' src/app/board.css \
  || fail "empty week shell must hide leaked later-track names"
if grep -qE 'data-hear-after-need-six|data-need-after-hear-six' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "later-rank quiet must not add another numbered hop stamp"
fi
if grep -q 'Not bidding? Hear the opening song' src/app/page.tsx; then
  fail "later-rank quiet must not add a second Hear hop"
fi
if grep -q 'data-hear-after-difference' src/app/page.tsx; then
  fail "later-rank quiet must not add a second Hear hop after the difference"
fi
if grep -qE 'data-later-rank-quiet|data-later-quiet|data-need-later-quiet' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "stamp-only later-quiet is REJECT"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-later-rank'; then
  fail "empty week must not stamp later-rank cards"
fi
if grep -n 'data-prize=' -A 8 src/app/page.tsx | grep -q 'data-later-rank'; then
  fail "occupied #1 prize must not stamp later-rank quiet"
fi
if grep -n 'className="opening-track"' -A 4 src/app/page.tsx | grep -q 'later-track'; then
  fail "later-rank titles must not mute the same opening-track node as occupied #1"
fi
if grep -n 'data-first-click="hear"' -A 16 src/app/page.tsx | grep -q 'data-listen-later'; then
  fail "later Listen must not sit on the occupied Hear hop"
fi
if grep -q 'className="track"' src/app/page.tsx; then
  fail "later-rank titles must not reuse the prize-weight track heading"
fi
if grep -q 'card-cue' src/app/page.tsx src/app/board.css; then
  fail "later-rank cards must not keep Cue chrome that mimics the opening song"
fi
if grep -E '^\.track \{' src/app/board.css; then
  fail "later-rank CSS must not keep a shared .track prize node"
fi
if grep -nE 'data-later-quiet\] \.opening-track|\.opening-track\[data-later' src/app/board.css >/dev/null; then
  fail "later-rank titles must not mute the same .opening-track node as occupied #1"
fi
later_track_rule="$(awk '/^\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\] \.later-track\[data-later-track\] \{/,/\}/' src/app/board.css)"
echo "$later_track_rule" | grep -q 'font-size: 0.92rem' \
  || fail "later-rank titles must read smaller than the occupied opening song"
echo "$later_track_rule" | grep -q 'font-family: var(--sans)' \
  || fail "later-rank titles must recede by anatomy, not the prize serif"
if echo "$later_track_rule" | grep -q 'background:'; then
  fail "later-rank titles must recede by anatomy, not a recolor"
fi
if echo "$later_track_rule" | grep -q 'var(--primary)'; then
  fail "later-rank titles must not steal prize chrome"
fi
if echo "$later_track_rule" | grep -q '0.78rem'; then
  fail "later-rank titles must not stamp-mute the prize title at 0.78rem"
fi
prize_title_keep="$(awk '/^\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track \{/,/\}/' src/app/board.css)"
echo "$prize_title_keep" | grep -q 'font-size: clamp(2.85rem, 8vw, 4.4rem)' \
  || fail "later-rank cut must keep the occupied title larger than later tracks"
if echo "$prize_title_keep" | grep -q 'background:'; then
  fail "later-rank cut must not recolor the occupied title"
fi
later_listen_rule="$(awk '/^\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\] \.listen\.later-listen\[data-listen-later\] \{/,/\}/' src/app/board.css)"
echo "$later_listen_rule" | grep -q 'font-size: 0.68rem' \
  || fail "later Listen must stay quieter than occupied Hear"
if echo "$later_listen_rule" | grep -q 'background:'; then
  fail "later Listen must stay a later hop, not a filled Hear twin"
fi
hear_keep="$(awk '/^\.week-occupied \.opening-listen \{/,/\}/' src/app/board.css)"
echo "$hear_keep" | grep -q 'background: var(--ink)' \
  || fail "later-rank cut must keep occupied Hear as the filled first click"
later_rank_badge="$(awk '/^\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\] \.rank \{/,/\}/' src/app/board.css)"
echo "$later_rank_badge" | grep -q 'background: transparent' \
  || fail "later-rank badges must not share #1 prize fill"
if echo "$later_rank_badge" | grep -q 'var(--primary)'; then
  fail "later-rank badges must not steal prize chrome"
fi
later_card_rule="$(awk '/^\.week-occupied \.later-stack\[data-later-stack\] \.later-card\[data-later-rank\] \{/,/\}/' src/app/board.css)"
echo "$later_card_rule" | grep -q 'min-height: 0' \
  || fail "later-rank cards must recede vs the studio deck"
echo "$later_card_rule" | grep -q 'border-top: 1px dashed var(--line)' \
  || fail "later-rank cards must recede as a roster, not prize cards"
if echo "$later_card_rule" | grep -q 'background: var(--'; then
  fail "later-rank cards must recede by anatomy, not a recolor"
fi
need_group_keep="$(awk '/^\.week-occupied \.claim-rail \.raise-after-hear \{/,/\}/' src/app/board.css)"
echo "$need_group_keep" | grep -q 'margin: 0 0 0.85rem' \
  || fail "later-rank cut must keep Need \$N grouped with Claim"
if echo "$need_group_keep" | grep -q 'background:'; then
  fail "later-rank cut must not recolor occupied Need \$N"
fi
if ! awk '
  /function ListingCard/ { card=NR }
  card && /data-later-rank/ && !later { later=NR }
  card && /data-later-track/ && !track { track=NR }
  card && /data-listen-later/ && !hop { hop=NR }
  /export function OpeningDeck/ { deck=NR }
  deck && /data-prize/ && !prize { prize=NR }
  /data-first-click="hear"/ && !hear { hear=NR }
  END { exit !(card && later && track && hop && deck && prize && hear && card < later && later < track && track < hop && hop < deck && prize > deck && hear > prize) }
' src/app/page.tsx; then
  fail "later-rank cards must recede after occupied Hear / prize, with a later Listen hop"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "later-rank cut must not rebuild the station desk into a stacked layout"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "later-rank cut must not revive the stays-dark empty week"
fi

echo "== UX: unpaid stays off the station desk — No #1 until Polar reports paid =="
grep -q 'export function isPolarPaidListing' src/core/rank.ts \
  || fail "rank.ts must export isPolarPaidListing"
grep -q 'filter(isPolarPaidListing)' src/core/rank.ts \
  || fail "rankListings must drop unpaid Polar checkout"
grep -q 'listPaidInRollingWeek(now).filter(isPolarPaidListing)' src/core/rank.ts \
  || fail "live board must load Polar-paid listings in the rolling last 7 days"
grep -q 'export function listUnpaid' src/core/store.ts \
  || fail "store.ts must expose unpaid Polar checkout off the desk"
grep -q 'export function rememberUnpaidCheckout' src/core/store.ts \
  || fail "store.ts must remember unpaid Polar checkout"
grep -q 'hasPaidInstant(listing)' src/core/store.ts \
  || fail "listPaidForWeek must keep Polar-paid rows only"
grep -q 'rememberUnpaidCheckout' src/app/api/checkout/route.ts \
  || fail "checkout must remember unpaid Polar checkout off the desk"
grep -q 'forgetUnpaidCheckout' src/app/api/polar/webhook/route.ts \
  || fail "abandoned Polar webhook must forget unpaid checkout"
grep -q 'listUnpaid' src/app/page.tsx \
  || fail "board page must load unpaid Polar leftover off the desk"
grep -q 'data-unpaid-off' src/app/page.tsx \
  || fail "empty leftover Polar checkout must stamp unpaid-off"
grep -q 'An unpaid Polar checkout stays off this desk until Polar reports paid' src/app/page.tsx \
  || fail "empty leftover must say unpaid Polar checkout stays off this desk"
grep -q 'data-unpaid-off' src/app/outbid-form.tsx \
  || fail "claim form must stamp unpaid Polar checkout stays off the desk"
grep -q 'Unpaid Polar checkout stays off this desk until Polar reports paid' src/app/outbid-form.tsx \
  || fail "claim form must say unpaid Polar checkout stays off this desk"
grep -q 'An abandoned track is not #1' src/app/outbid-form.tsx \
  || fail "claim form must say an abandoned track is not #1"
grep -q 'Polar reports paid' src/app/return/page.tsx \
  || fail "return page must wait for Polar paid, not the query string"
grep -Fq '.claim-note[data-unpaid-off]' src/app/board.css \
  || fail "CSS must make unpaid-off certain on the claim note"
grep -Fq '.board[data-unpaid-off] [data-prize]' src/app/board.css \
  || fail "unpaid leftover CSS must hide prize chrome"
grep -Fq '.board[data-unpaid-off] .opening-listen' src/app/board.css \
  || fail "unpaid leftover CSS must hide Hear"
grep -Fq '.board[data-unpaid-off] [data-hear-opening]' src/app/board.css \
  || fail "unpaid leftover CSS must hide hear-opening"
grep -Fq '.week-empty[data-unpaid-off] [data-prize]' src/app/board.css \
  || fail "empty unpaid leftover CSS must hide prize chrome"
grep -Fq '.week-empty[data-unpaid-off] .later-stack' src/app/board.css \
  || fail "empty unpaid leftover CSS must hide later-stack"
unpaid_hide="$(awk '/^\.board\[data-unpaid-off\] \.hear-after-raise,/,/^\}/' src/app/board.css)"
echo "$unpaid_hide" | grep -q 'display: none' \
  || fail "unpaid leftover CSS must hide occupied prize / Hear / later-stack"
echo "$unpaid_hide" | grep -q 'data-prize' \
  || fail "unpaid leftover CSS must hide data-prize"
echo "$unpaid_hide" | grep -q 'opening-listen' \
  || fail "unpaid leftover CSS must hide Hear"
echo "$unpaid_hide" | grep -q 'later-stack' \
  || fail "unpaid leftover CSS must hide later-stack"
if echo "$unpaid_hide" | grep -q 'background:'; then
  fail "unpaid leftover must hide occupied chrome, not recolor the desk"
fi
grep -q 'unpaid stays off the station desk' tests/product-ui.test.ts \
  || fail "product-ui tests must cover unpaid Polar checkout off the station desk"
grep -q 'unpaid Polar checkout never ranks as #1' tests/rank.test.ts \
  || fail "rank tests must drop unpaid Polar checkout from rankListings"
grep -q 'unpaid Polar checkout stays off the station desk until Polar reports paid' tests/checkout.test.ts \
  || fail "checkout tests must keep unpaid Polar checkout off the desk"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "unpaid-off cut must keep occupied song title as the prize"
grep -q 'Hear last 7 days' src/app/page.tsx \
  || fail "unpaid-off cut must keep occupied Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "unpaid-off cut must keep occupied Hear the first click"
grep -q 'className="raise-after-hear"' src/app/page.tsx \
  || fail "unpaid-off cut must keep Need \$N grouped with Claim"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "unpaid-off cut must keep Claim #1"
grep -q 'No opening song' src/app/page.tsx \
  || fail "unpaid-off cut must keep empty No opening song"
grep -q 'Then the listen URL' src/app/outbid-form.tsx \
  || fail "unpaid-off cut must keep empty later listen URL"
grep -q 'data-first-click="claim"' src/app/outbid-form.tsx \
  || fail "unpaid-off cut must keep empty Claim #1 the first click"
grep -q 'data-later-stack' src/app/page.tsx \
  || fail "unpaid-off cut must keep later-rank tracks quieter than #1"
grep -q 'station-desk' src/app/page.tsx \
  || fail "unpaid-off cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "unpaid-off cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "unpaid-off cut must keep the station-desk columns"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "unpaid-off cut must keep the dashed amount"
grep -q 'className="step"' src/app/outbid-form.tsx \
  || fail "unpaid-off cut must keep ± steppers"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "unpaid-off cut must keep Outbid"
if grep -qE 'data-hear-after-need-six|data-need-after-hear-six' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "unpaid-off must not add another numbered hop stamp"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "unpaid-off must not rebuild the station desk into a stacked layout"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'prize-before-price'; then
  fail "empty week must not stamp prize before price"
fi
if awk '/function EmptyClaimFirstWrite/,/export function BidForm/' src/app/outbid-form.tsx | grep -q 'Hear this week'; then
  fail "empty Claim #1 must not invent Hear"
fi
if echo "$unpaid_hide" | grep -q 'background:'; then
  fail "unpaid leftover must hide occupied chrome, not recolor the desk"
fi
unpaid_note_rule="$(awk '/^\.claim-note\[data-unpaid-off\] \{/,/\}/' src/app/board.css)"
echo "$unpaid_note_rule" | grep -q 'font-weight: 600' \
  || fail "unpaid leftover claim note must be certain by weight"
if echo "$unpaid_note_rule" | grep -q 'background:'; then
  fail "unpaid leftover claim note must not recolor the desk"
fi
if ! awk '
  /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track/ { prize=NR }
  /\.week-occupied \.opening-listen \{/ { hear=NR }
  /Empty week: Listen URL is a later write after Claim #1 \/ Outbid/ { later=NR }
  /Unpaid Polar checkout stays off the station desk/ { unpaid=NR }
  END { exit !(prize && hear && later && unpaid && prize < hear && hear < later && later < unpaid) }
' src/app/board.css; then
  fail "unpaid-off CSS must sit after occupied prize / Hear / empty later-write"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "unpaid-off cut must not revive the stays-dark empty week"
fi

echo "== UX: occupied week window is rolling last-7-days — not Monday 00:00 UTC =="
[[ -f tests/week.test.ts ]] || fail "missing tests/week.test.ts"
grep -q 'ROLLING_WEEK_MS' src/core/week.ts \
  || fail "week.ts must export the rolling last-7-days window"
grep -q 'export function rollingWeekStart' src/core/week.ts \
  || fail "week.ts must export rollingWeekStart"
grep -q 'export function bidInRollingWeek' src/core/week.ts \
  || fail "week.ts must export bidInRollingWeek"
grep -q 'listPaidInRollingWeek' src/core/store.ts \
  || fail "store.ts must list Polar-paid rows in the rolling last 7 days"
grep -q 'bidInRollingWeek(listing.firstPaidAt' src/core/store.ts \
  || fail "live paid rows must filter firstPaidAt, not weekId delete"
grep -q 'findPaidByListenUrl' src/core/store.ts \
  || fail "raise identity must look up the same listen URL still live in the window"
grep -q 'findPaidByListenUrl(listingDraft.listenUrl)' src/app/api/checkout/route.ts \
  || fail "checkout raise must use the rolling live listing"
grep -q 'getBoardListings()' src/app/page.tsx \
  || fail "occupied board must load the rolling last-7-days live board"
grep -q 'data-rolling-week=""' src/app/page.tsx \
  || fail "occupied board must stamp the rolling last-7-days window"
grep -q 'Rolling last 7 days. Not Monday 00:00 UTC.' src/app/page.tsx \
  || fail "occupied board must name the rolling last-7-days window, not Monday midnight"
grep -q 'className="period-meta week-window"' src/app/page.tsx \
  || fail "occupied period meta must name the rolling window"
grep -q 'className="period-meta"' src/app/page.tsx \
  || fail "empty week must keep ISO weekId period meta, not the rolling cue"
grep -Fq '.week-occupied .period-meta.week-window[data-rolling-week]' src/app/board.css \
  || fail "CSS must compose occupied rolling last-7-days on the period meta"
grep -Fq '.week-empty [data-rolling-week]' src/app/board.css \
  || fail "empty week CSS must keep rolling-week stamps off Bid USD / \$5"
grep -Fq '.week-empty .week-window' src/app/board.css \
  || fail "empty week CSS must keep week-window copy off Bid USD / \$5"
grep -Fq '.board[data-empty-bid-five] [data-rolling-week]' src/app/board.css \
  || fail "empty Bid USD / \$5 CSS must keep rolling-week stamps off Claim #1"
grep -q 'Rolling last 7 days. Not Monday 00:00 UTC.' src/app/rules/page.tsx \
  || fail "rules must name the rolling last-7-days window"
grep -q 'rolling last 7 days' src/app/about/page.tsx \
  || fail "about must name the rolling last-7-days window"
grep -q 'occupied week window is rolling last-7-days' tests/product-ui.test.ts \
  || fail "product-ui tests must cover occupied rolling last-7-days window"
grep -Fq 'rolling last-7-days window is 7 * 24h' tests/week.test.ts \
  || fail "week tests must cover rolling last-7-days length"
grep -q 'Monday 00:00 UTC does not drop a bid still inside the rolling week' tests/week.test.ts \
  || fail "week tests must keep a Sunday pay across Monday midnight"
grep -q 'live board keeps a Sunday pay across Monday 00:00 UTC' tests/week.test.ts \
  || fail "week tests must keep Sunday pay on the live board across Monday"
grep -q 'only the rolling last 7 days is ranked on the live board' tests/rank.test.ts \
  || fail "rank tests must cover the rolling last-7-days live board"
if awk '/function EmptyClaimFirstWrite/,/export function BidForm/' src/app/outbid-form.tsx | grep -q 'data-rolling-week'; then
  fail "empty week must not stamp the rolling week window"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-rolling-week=""'; then
  fail "empty week must not stamp the rolling week window on Bid USD / \$5"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'prize-before-price'; then
  fail "empty week must not stamp prize before price"
fi
if grep -qE 'data-hear-after-need-six|data-need-after-hear-six' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "rolling week must not add another numbered hop stamp"
fi
if grep -Eqi '24h lock|lock on #1' src/app/page.tsx src/app/outbid-form.tsx src/app/board.css; then
  fail "rolling week is not a 24h lock on #1"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "rolling-week cut must not rebuild the station desk into a stacked layout"
fi
grep -q 'data-prize=' src/app/page.tsx \
  || fail "rolling-week cut must keep occupied song title as the prize"
grep -q 'Hear last 7 days' src/app/page.tsx \
  || fail "rolling-week cut must keep occupied Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "rolling-week cut must keep occupied Hear the first click"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "rolling-week cut must keep empty week as Bid USD / \$5"
grep -q 'data-unpaid-off' src/app/page.tsx \
  || fail "rolling-week cut must keep unpaid Polar checkout off the desk"
grep -q 'data-later-stack' src/app/page.tsx \
  || fail "rolling-week cut must keep later-rank tracks quieter than #1"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "rolling-week cut must keep Claim #1"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "rolling-week cut must keep the dashed amount"
grep -q 'className="step"' src/app/outbid-form.tsx \
  || fail "rolling-week cut must keep ± steppers"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "rolling-week cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "rolling-week cut must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "rolling-week cut must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "rolling-week cut must keep the station-desk columns"
rolling_window_rule="$(awk '/^\.week-occupied \.period-meta\.week-window\[data-rolling-week\] \{/,/\}/' src/app/board.css)"
echo "$rolling_window_rule" | grep -q 'font-size: 0.86rem' \
  || fail "occupied rolling window copy must stay certain by size, not a recolor"
if echo "$rolling_window_rule" | grep -q 'background:'; then
  fail "rolling week must name the window, not recolor the desk"
fi
empty_rolling_rule="$(awk '/^\.board\[data-empty-bid-five\] \.hear-after-raise,/,/^\}/' src/app/board.css)"
echo "$empty_rolling_rule" | grep -q 'data-rolling-week' \
  || fail "empty Bid USD / \$5 CSS must hide rolling-week stamps"
echo "$empty_rolling_rule" | grep -q 'display: none' \
  || fail "empty week CSS must hide rolling-week stamps"
if echo "$empty_rolling_rule" | grep -q 'background:'; then
  fail "empty week must hide rolling-week stamps, not recolor the desk"
fi
if ! awk '
  /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track/ { prize=NR }
  /\.week-occupied \.opening-listen \{/ { hear=NR }
  /Empty week: Listen URL is a later write after Claim #1 \/ Outbid/ { later=NR }
  /Unpaid Polar checkout stays off the station desk/ { unpaid=NR }
  /Occupied rolling last-7-days window/ { rolling=NR }
  END { exit !(prize && hear && later && unpaid && rolling && prize < hear && hear < later && later < unpaid && unpaid < rolling) }
' src/app/board.css; then
  fail "rolling-week CSS must sit after occupied prize / Hear / empty later-write / unpaid-off"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "rolling-week cut must not revive the stays-dark empty week"
fi

echo "== UX: empty station copy is a rolling last-7-days window — not Monday 00:00 UTC =="
grep -q 'data-empty-window=""' src/app/page.tsx \
  || fail "empty station must stamp a fair last-7-days window"
grep -q 'className="period-meta"' src/app/page.tsx \
  || fail "empty station must keep period meta, not occupied week-window chrome"
grep -q 'Last 7 days from a paid open. Not Monday midnight UTC.' src/app/page.tsx \
  || fail "empty station copy must name last 7 days, not Monday midnight UTC"
grep -q 'The open is last 7 days from that payment — not Monday midnight UTC.' src/app/page.tsx \
  || fail "empty deck note must name last 7 days, not Monday midnight UTC"
if grep -Fq 'Week {weekId}. Next reset {nextResetAt}.' src/app/page.tsx; then
  fail "empty station must not expire the week at Monday 00:00 UTC next-reset copy"
fi
if grep -Fq 'Until then this week stays empty.' src/app/page.tsx; then
  fail "empty deck must not leave the open as an unnamed this-week expiry"
fi
grep -q 'empty open is last 7 days from a paid claim' src/app/rules/page.tsx \
  || fail "rules must say the empty open is last 7 days, not Monday 00:00 UTC"
grep -q 'Empty station copy names the same fair window' SPEC.md \
  || fail "SPEC must say empty station copy names the rolling last-7-days window"
grep -q 'empty station copy is a rolling last-7-days window' tests/product-ui.test.ts \
  || fail "product-ui tests must cover empty last-7-days copy"
grep -Fq '.week-empty .period-meta[data-empty-window]' src/app/board.css \
  || fail "CSS must compose empty last-7-days copy on the period meta"
grep -Fq '.week-empty .empty-deck .deck-note' src/app/board.css \
  || fail "CSS must make empty last-7-days deck copy certain"
grep -Fq '.week-occupied [data-empty-window]' src/app/board.css \
  || fail "occupied CSS must keep empty-window copy off Hear / song prize"
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-rolling-week=""'; then
  fail "empty week must not stamp occupied rolling chrome on Bid USD / \$5"
fi
if grep -n 'data-empty-window' src/app/page.tsx | grep -q 'data-rolling-week'; then
  fail "empty last-7-days copy must not reuse occupied rolling chrome"
fi
if awk '/function EmptyClaimFirstWrite/,/export function BidForm/' src/app/outbid-form.tsx | grep -q 'data-empty-window'; then
  fail "empty Claim #1 must not stamp the last-7-days window on the form"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty last-7-days copy must not invent a Hear hop"
fi
if grep -qE 'data-hear-after-need-six|data-need-after-hear-six' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty last-7-days copy must not add another numbered hop stamp"
fi
if grep -Eqi '24h lock|lock on #1' src/app/page.tsx src/app/outbid-form.tsx src/app/board.css; then
  fail "empty last-7-days window is not a 24h lock on #1"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "empty last-7-days copy must not rebuild the station desk into a stacked layout"
fi
grep -q 'data-rolling-week=""' src/app/page.tsx \
  || fail "empty last-7-days copy must keep occupied rolling chrome"
grep -q 'Rolling last 7 days. Not Monday 00:00 UTC.' src/app/page.tsx \
  || fail "empty last-7-days copy must keep occupied rolling last-7-days sentence"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "empty last-7-days copy must keep occupied song title as the prize"
grep -q 'Hear last 7 days' src/app/page.tsx \
  || fail "empty last-7-days copy must keep occupied Hear"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "empty last-7-days copy must keep occupied Hear the first click"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "empty last-7-days copy must keep empty week as Bid USD / \$5"
grep -q 'data-unpaid-off' src/app/page.tsx \
  || fail "empty last-7-days copy must keep unpaid Polar checkout off the desk"
grep -q 'data-later-stack' src/app/page.tsx \
  || fail "empty last-7-days copy must keep later-rank tracks quieter than #1"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "empty last-7-days copy must keep Claim #1"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "empty last-7-days copy must keep the dashed amount"
grep -q 'className="step"' src/app/outbid-form.tsx \
  || fail "empty last-7-days copy must keep ± steppers"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "empty last-7-days copy must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "empty last-7-days copy must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "empty last-7-days copy must leave the claim rail in place"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "empty last-7-days copy must keep the station-desk columns"
empty_window_rule="$(awk '/^\.week-empty \.period-meta\[data-empty-window\] \{/,/\}/' src/app/board.css)"
echo "$empty_window_rule" | grep -q 'font-size: 0.86rem' \
  || fail "empty last-7-days copy must stay certain by size, not a recolor"
echo "$empty_window_rule" | grep -q 'font-weight: 600' \
  || fail "empty last-7-days copy must stay certain by weight, not a recolor"
if echo "$empty_window_rule" | grep -q 'background:'; then
  fail "empty last-7-days copy must name the window, not recolor the desk"
fi
empty_note_rule="$(awk '/^\.week-empty \.empty-deck \.deck-note \{/,/\}/' src/app/board.css)"
echo "$empty_note_rule" | grep -q 'font-weight: 600' \
  || fail "empty last-7-days deck note must stay certain by weight"
if echo "$empty_note_rule" | grep -q 'background:'; then
  fail "empty last-7-days deck note must not recolor the desk"
fi
if ! awk '
  /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track/ { prize=NR }
  /\.week-occupied \.opening-listen \{/ { hear=NR }
  /Empty week: Listen URL is a later write after Claim #1 \/ Outbid/ { later=NR }
  /Unpaid Polar checkout stays off the station desk/ { unpaid=NR }
  /Occupied rolling last-7-days window/ { rolling=NR }
  /Empty week names last 7 days/ { empty=NR }
  END { exit !(prize && hear && later && unpaid && rolling && empty && prize < hear && hear < later && later < unpaid && unpaid < rolling && rolling < empty) }
' src/app/board.css; then
  fail "empty last-7-days CSS must sit after occupied prize / Hear / empty later-write / unpaid-off / occupied rolling"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "empty last-7-days copy must not revive the stays-dark empty week"
fi

echo "== UX: occupied raise identity is last-7-days — not the UTC week label =="
grep -q 'Same canonical listen URL still inside last 7 days raises' src/app/rules/page.tsx \
  || fail "occupied /rules must name last-7-days raise identity"
grep -q 'weekId</code> stays an audit label — not raise identity' src/app/rules/page.tsx \
  || fail "occupied /rules must keep weekId as an audit label"
if grep -qi 'same UTC week raises' src/app/rules/page.tsx; then
  fail "occupied /rules must not tax raise identity as the UTC week"
fi
if grep -qi 'in the same weekId' src/app/rules/page.tsx SPEC.md; then
  fail "raise identity must not key on weekId"
fi
grep -Fq '**Identity for raise:** canonical `listenUrl` still inside the rolling last 7 days' SPEC.md \
  || fail "SPEC must name last-7-days raise identity"
grep -Fq '`weekId` stays a Polar/audit label — not raise identity' SPEC.md \
  || fail "SPEC must keep weekId as an audit label, not raise identity"
grep -Fq 'Same listen URL still inside last 7 days may raise. `weekId` is not the raise key.' SPEC.md \
  || fail "SPEC raise rule must raise inside last 7 days, not weekId"
grep -Fq 'Raise identity is the same canonical listen URL still inside that window — not `weekId`' BUILD.md \
  || fail "BUILD must keep raise identity off weekId"
grep -q 'Same listen URL still inside last 7 days raises' src/core/rank.ts \
  || fail "rank.ts must name last-7-days raise identity"
grep -q 'weekId is not the raise key' src/core/rank.ts \
  || fail "rank.ts must keep weekId off raise identity"
grep -q 'weekId is not the raise key' src/core/listing.ts \
  || fail "listing.ts must keep weekId off raise identity"
grep -q 'export function listingListenKey(listenUrl: string)' src/core/listing.ts \
  || fail "listingListenKey must key raise on the listen URL, not weekId"
if grep -Fq '${weekId}|' src/core/listing.ts; then
  fail "listingListenKey must not prefix raise identity with weekId"
fi
grep -q 'findPaidByListenUrl(listingDraft.listenUrl)' src/app/api/checkout/route.ts \
  || fail "checkout raise must look up the rolling live listing"
if grep -A 20 'export async function POST' src/app/api/checkout/route.ts | grep -q 'listPaidForWeek'; then
  fail "checkout must not key raise identity on weekId"
fi
grep -A 20 'export function applyPaidEvent' src/core/store.ts | grep -q 'findPaidByListenUrl' \
  || fail "applyPaidEvent must look up the rolling live listing"
if grep -A 40 'export function applyPaidEvent' src/core/store.ts | grep -q 'listPaidForWeek'; then
  fail "applyPaidEvent must not key raise identity on weekId"
fi
grep -Fq 'Raise identity is `findPaidByListenUrl`' src/core/store.ts \
  || fail "weekId listing lookup must stay an audit helper, not raise identity"
grep -Fq 'Raise identity: same canonical listen URL still inside last 7 days. Not weekId.' src/core/week.ts \
  || fail "week.ts must name last-7-days raise identity, not weekId"
grep -q 'occupied /rules raise identity is last-7-days, not the UTC week label' tests/playback.test.ts \
  || fail "rules tests must cover last-7-days raise identity"
grep -q 'same listen URL still inside last-7-days raises after the UTC week label rolls' tests/checkout.test.ts \
  || fail "checkout tests must cover Sunday pay Monday raise"
grep -q 'raise identity key is the canonical listen URL, not weekId' tests/listing.test.ts \
  || fail "listing tests must cover last-7-days raise identity"
grep -q 'Raise pays difference' src/app/rules/page.tsx \
  || fail "raise-identity cut must keep raise pays difference"
grep -q 'Rolling last 7 days. Not Monday 00:00 UTC.' src/app/rules/page.tsx \
  || fail "raise-identity cut must keep occupied rolling last-7-days"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "raise-identity cut must keep occupied song title as the prize"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "raise-identity cut must keep occupied Hear the first click"
grep -q 'Hear last 7 days' src/app/page.tsx \
  || fail "raise-identity cut must keep occupied Hear"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "raise-identity cut must keep Claim #1"
grep -q 'Then the listen URL' src/app/outbid-form.tsx \
  || fail "raise-identity cut must keep empty later-write listen URL"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "raise-identity cut must keep the dashed amount"
grep -q 'className="step"' src/app/outbid-form.tsx \
  || fail "raise-identity cut must keep ± steppers"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "raise-identity cut must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "raise-identity cut must not rebuild the station desk"
grep -q 'data-unpaid-off' src/app/page.tsx \
  || fail "raise-identity cut must keep unpaid off the board"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "raise-identity cut must keep honest empty station"
grep -q 'Last 7 days from a paid open. Not Monday midnight UTC.' src/app/page.tsx \
  || fail "raise-identity cut must keep empty rolling-copy"
grep -q 'data-rolling-week=""' src/app/page.tsx \
  || fail "raise-identity cut must keep occupied rolling last-7-days"
if awk '/function EmptyClaimFirstWrite/,/export function BidForm/' src/app/outbid-form.tsx | grep -q 'Hear this week'; then
  fail "empty Claim #1 must not invent Hear"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear this week'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -qE 'data-hear-after-need-six|data-need-after-hear-six|data-hear-after-need-seven' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx src/app/rules/page.tsx; then
  fail "raise identity must not add another numbered hop stamp"
fi
if grep -Eqi '24h lock|lock on #1' src/core/rank.ts src/core/store.ts src/core/week.ts src/core/listing.ts; then
  fail "raise identity is not a 24h lock on #1"
fi
if grep -qE 'grid-template-columns: 1fr 1fr' src/app/outbid-form.tsx src/app/page.tsx src/app/rules/page.tsx; then
  fail "raise identity must not rebuild the station desk into a long form"
fi
python3 - src/app/board.css <<'PY' || fail "raise identity must not recolor the station"
import sys
css = open(sys.argv[1], encoding="utf-8").read()
if "raise-identity" in css or "raise-rolling" in css:
    raise SystemExit(1)
PY

echo "== UX: occupied Hear / later tracks name last-7-days — not this week =="
grep -q 'Hear last 7 days' src/app/page.tsx \
  || fail "occupied Hear must name last 7 days, not this week"
grep -q "Hear last 7 days&apos; opening song" src/app/page.tsx \
  || fail "occupied Hear copy must name last 7 days' opening song"
grep -q 'Also last 7 days' src/app/page.tsx \
  || fail "occupied later tracks must name last 7 days, not this week"
grep -q "Last 7 days&apos; opening song is on" src/app/page.tsx \
  || fail "occupied lede must name last 7 days, not this week"
grep -q 'data-hear-window=""' src/app/page.tsx \
  || fail "occupied Hear must stamp last-7-days window chrome"
grep -q 'data-later-window=""' src/app/page.tsx \
  || fail "occupied later tracks must stamp last-7-days window chrome"
grep -q 'data-occupied-window=""' src/app/page.tsx \
  || fail "occupied lede must stamp last-7-days window chrome"
if grep -q "Hear this week" src/app/page.tsx; then
  fail "occupied Hear must not name a calendar week"
fi
if grep -q "Also this week" src/app/page.tsx; then
  fail "occupied later tracks must not name a calendar week"
fi
if grep -q "This week&apos;s opening song is on" src/app/page.tsx; then
  fail "occupied lede must not name this week's opening song"
fi
grep -q 'Occupied Hear and later tracks name last 7 days, not this calendar week' SPEC.md \
  || fail "SPEC must say occupied Hear / later tracks name last 7 days"
grep -q 'occupied Hear / later tracks name last-7-days' tests/product-ui.test.ts \
  || fail "product-ui tests must cover occupied Hear / later tracks last-7-days chrome"
grep -Fq '.week-occupied .lede[data-first-read="hear"][data-occupied-window]' src/app/board.css \
  || fail "CSS must compose occupied last-7-days lede"
grep -Fq '.week-occupied .opening-listen[data-hear-window]' src/app/board.css \
  || fail "CSS must compose occupied last-7-days Hear"
grep -Fq '.week-occupied .queue.later-stack[data-later-stack] .queue-head h2[data-later-window]' src/app/board.css \
  || fail "CSS must compose occupied last-7-days later tracks"
grep -Fq '.week-empty [data-occupied-window]' src/app/board.css \
  || fail "empty CSS must keep occupied last-7-days lede off Claim #1"
grep -Fq '.week-empty [data-hear-window]' src/app/board.css \
  || fail "empty CSS must keep occupied last-7-days Hear off Claim #1"
grep -Fq '.week-empty [data-later-window]' src/app/board.css \
  || fail "empty CSS must keep occupied last-7-days later tracks off Claim #1"
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'Hear last 7 days'; then
  fail "empty week must not invent a Hear hop"
fi
if grep -n 'data-empty-week' -A 20 src/app/page.tsx | grep -q 'data-hear-window'; then
  fail "empty week must not stamp occupied Hear last-7-days chrome"
fi
if grep -n 'data-empty-window' src/app/page.tsx | grep -q 'data-hear-window'; then
  fail "empty last-7-days copy must not reuse occupied Hear chrome"
fi
if awk '/function EmptyClaimFirstWrite/,/export function BidForm/' src/app/outbid-form.tsx | grep -q 'Hear last 7 days'; then
  fail "empty Claim #1 must not invent Hear"
fi
if awk '/function EmptyClaimFirstWrite/,/export function BidForm/' src/app/outbid-form.tsx | grep -q 'data-hear-window'; then
  fail "empty Claim #1 must not stamp occupied Hear chrome"
fi
if grep -qE 'data-hear-after-need-six|data-need-after-hear-six|data-hear-after-need-seven' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "occupied last-7-days chrome must not add another numbered hop stamp"
fi
if grep -Eqi '24h lock|lock on #1' src/app/page.tsx src/app/outbid-form.tsx src/app/board.css; then
  fail "occupied last-7-days chrome is not a 24h lock on #1"
fi
if grep -q 'station-desk hear-first' src/app/page.tsx; then
  fail "occupied last-7-days chrome must not rebuild the station desk into a stacked layout"
fi
grep -q 'data-rolling-week=""' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep occupied rolling last-7-days"
grep -q 'Rolling last 7 days. Not Monday 00:00 UTC.' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep occupied rolling last-7-days sentence"
grep -q 'Last 7 days from a paid open. Not Monday midnight UTC.' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep empty rolling-copy"
grep -q 'Same canonical listen URL still inside last 7 days raises' src/app/rules/page.tsx \
  || fail "occupied last-7-days chrome must keep last-7-days raise identity"
grep -q 'weekId is not the raise key' src/core/listing.ts \
  || fail "occupied last-7-days chrome must not restamp raise-rolling-identity"
grep -q 'data-prize=' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep occupied song title as the prize"
grep -q 'data-first-click="hear"' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep occupied Hear the first click"
grep -q 'Claim #1 for' src/app/outbid-form.tsx \
  || fail "occupied last-7-days chrome must keep Claim #1"
grep -q 'Then the listen URL' src/app/outbid-form.tsx \
  || fail "occupied last-7-days chrome must keep empty later-write listen URL"
grep -q 'amount-field' src/app/outbid-form.tsx \
  || fail "occupied last-7-days chrome must keep the dashed amount"
grep -q 'className="step"' src/app/outbid-form.tsx \
  || fail "occupied last-7-days chrome must keep ± steppers"
grep -q 'Outbid' src/app/outbid-form.tsx \
  || fail "occupied last-7-days chrome must keep Outbid"
grep -q 'station-desk' src/app/page.tsx \
  || fail "occupied last-7-days chrome must not rebuild the station desk"
grep -q 'claim-rail' src/app/page.tsx \
  || fail "occupied last-7-days chrome must leave the claim rail in place"
grep -q 'data-unpaid-off' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep unpaid off the board"
grep -q 'data-empty-bid-five' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep honest empty station"
grep -q 'data-later-stack' src/app/page.tsx \
  || fail "occupied last-7-days chrome must keep later-rank tracks quieter than #1"
grep -q 'grid-template-columns: minmax(0, 1.45fr)' src/app/board.css \
  || fail "occupied last-7-days chrome must keep the station-desk columns"
lede_window_rule="$(awk '/^\.week-occupied \.lede\[data-first-read="hear"\]\[data-occupied-window\] \{/,/\}/' src/app/board.css)"
echo "$lede_window_rule" | grep -q 'font-weight: 600' \
  || fail "occupied last-7-days lede must stay certain by weight, not a recolor"
if echo "$lede_window_rule" | grep -q 'background:'; then
  fail "occupied last-7-days lede must name the window, not recolor the desk"
fi
hear_window_rule="$(awk '/^\.week-occupied \.opening-listen\[data-hear-window\] \{/,/\}/' src/app/board.css)"
echo "$hear_window_rule" | grep -q 'font-weight: 700' \
  || fail "occupied last-7-days Hear must stay certain by weight, not a recolor"
if echo "$hear_window_rule" | grep -q 'background:'; then
  fail "occupied last-7-days Hear must name the window, not recolor the desk"
fi
if echo "$hear_window_rule" | grep -q 'min-height:'; then
  fail "occupied last-7-days Hear must not add another Hear hop size"
fi
later_window_rule="$(awk '/^\.week-occupied \.queue\.later-stack\[data-later-stack\] \.queue-head h2\[data-later-window\] \{/,/\}/' src/app/board.css)"
echo "$later_window_rule" | grep -q 'font-size: 1.05rem' \
  || fail "occupied last-7-days later tracks must stay certain by size, not a recolor"
echo "$later_window_rule" | grep -q 'font-weight: 600' \
  || fail "occupied last-7-days later tracks must stay certain by weight, not a recolor"
if echo "$later_window_rule" | grep -q 'background:'; then
  fail "occupied last-7-days later tracks must name the window, not recolor the desk"
fi
if ! awk '
  /\.week-occupied \.studio-deck\[data-prize-before-price\] \.opening-track/ { prize=NR }
  /\.week-occupied \.opening-listen \{/ { hear=NR }
  /Empty week: Listen URL is a later write after Claim #1 \/ Outbid/ { later=NR }
  /Unpaid Polar checkout stays off the station desk/ { unpaid=NR }
  /Occupied rolling last-7-days window/ { rolling=NR }
  /Empty week names last 7 days/ { empty=NR }
  /Occupied Hear \/ later tracks name last 7 days/ { chrome=NR }
  END { exit !(prize && hear && later && unpaid && rolling && empty && chrome && prize < hear && hear < later && later < unpaid && unpaid < rolling && rolling < empty && empty < chrome) }
' src/app/board.css; then
  fail "occupied last-7-days chrome CSS must sit after occupied prize / Hear / empty later-write / unpaid-off / occupied rolling / empty rolling-copy"
fi
if grep -qi 'stays dark' src/app/page.tsx src/app/board.css src/app/outbid-form.tsx; then
  fail "occupied last-7-days chrome must not revive the stays-dark empty week"
fi

echo "== checkout files =="
for f in \
  src/billing/port.ts \
  src/billing/fixture.ts \
  src/billing/polar.ts \
  src/config.ts \
  src/core/store.ts \
  src/core/listing.ts \
  src/app/api/checkout/route.ts \
  src/app/api/polar/webhook/route.ts \
  src/app/return/page.tsx \
  tests/checkout.test.ts
do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'createCheckout' src/billing/port.ts \
  || fail "port.ts must define createCheckout"
grep -q 'handleWebhook' src/billing/port.ts \
  || fail "port.ts must define handleWebhook"
grep -q 'export type PaymentPort' src/billing/port.ts \
  || fail "port.ts must export PaymentPort"
grep -q 'POLAR_FIXTURE_ONLY' src/config.ts \
  || fail "config.ts must honor POLAR_FIXTURE_ONLY"
grep -q 'polarLiveEnabled' src/config.ts \
  || fail "live Polar client is not env-gated"
grep -q 'export class FixturePayment' src/billing/fixture.ts \
  || fail "fixture.ts must export FixturePayment"
grep -q 'export class PolarPayment' src/billing/polar.ts \
  || fail "polar.ts must export PolarPayment"
grep -q 'POLAR_LIVE=1' src/billing/polar.ts \
  || fail "polar.ts must stay env-gated"
grep -q 'export function polarApiBase' src/billing/polar.ts \
  || fail "polar.ts must honor POLAR_API_BASE"
grep -q 'POLAR_API_BASE' src/billing/polar.ts \
  || fail "polar.ts must mention POLAR_API_BASE"
grep -q 'POLAR_API_BASE' scripts/live-smoke.sh \
  || fail "live-smoke.sh must pass POLAR_API_BASE to the live process"
grep -q 'sandbox.polar.sh' scripts/live-smoke.sh \
  || fail "live-smoke.sh must require a sandbox.polar.sh Checkout URL"
grep -q 'applyPaidEvent' src/core/store.ts \
  || fail "store.ts must apply paid events only"
grep -q 'export function quoteBid' src/core/listing.ts \
  || fail "listing.ts must quote create vs raise"
grep -q 'bid_not_higher' src/core/listing.ts \
  || fail "listing.ts must reject a non-increasing raise"
grep -q 'canonicalListenUrl' src/core/listing.ts \
  || fail "listing.ts must key raises on the canonical listen URL"
grep -q 'findPaidByListenUrl' src/core/store.ts \
  || fail "store.ts must look up the same listen URL still inside last 7 days"
grep -q 'kind: quote.kind' src/app/api/checkout/route.ts \
  || fail "checkout raise path must pass create or raise"
grep -q 'quoteBid' src/app/api/checkout/route.ts \
  || fail "checkout must charge the raise difference"
grep -q 'bid_not_higher' tests/checkout.test.ts \
  || fail "checkout tests must cover bid_not_higher"
grep -q 'pays \$7' tests/checkout.test.ts \
  || fail "checkout tests must cover SPEC acceptance 5"
grep -q 'same listen URL still inside last-7-days raises after the UTC week label rolls' tests/checkout.test.ts \
  || fail "checkout tests must raise a Sunday pay across Monday weekId"
grep -q 'data-return="paid"' src/app/return/page.tsx \
  || fail "return page must show paid copy"
grep -q 'data-return="pending"' src/app/return/page.tsx \
  || fail "return page must show pending copy"
grep -q 'never trust query' src/app/return/page.tsx \
  || grep -q 'not yet paid' src/app/return/page.tsx \
  || fail "return page must not trust the query string alone"
if grep -nE 'fetch\(|polar\.sh|api\.polar' src/billing/fixture.ts src/billing/port.ts >/dev/null; then
  fail "fixture/port must not call Polar over the network"
fi

echo "== rules / about / url / playback / click =="
for f in \
  src/app/about/page.tsx \
  src/app/rules/page.tsx \
  src/core/url.ts \
  src/core/playback.ts \
  src/app/click/[id]/route.ts \
  tests/listing.test.ts \
  tests/click.test.ts \
  tests/playback.test.ts
do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'href="/about"' src/app/layout.tsx || fail "nav must link to /about"
grep -q 'href="/rules"' src/app/layout.tsx || fail "nav must link to /rules"
grep -q 'Rank is the bid' src/app/about/page.tsx || fail "about must state rank is the bid"
grep -q 'Playback is real' src/app/about/page.tsx || fail "about must state real playback"
grep -q 'no invented play counts' src/app/about/page.tsx || fail "about must forbid invented play counts"
grep -q 'no fake streams' src/app/about/page.tsx || fail "about must forbid fake streams"
grep -q 'playlist-headline' src/app/about/page.tsx || fail "about must name the playlist-headline vertical"
grep -q '\$5' src/app/rules/page.tsx || fail "rules must state min \$5"
grep -q 'Older wins ties' src/app/rules/page.tsx || fail "rules must state older wins ties"
grep -q 'Raise pays difference' src/app/rules/page.tsx || fail "rules must state raise pays difference"
grep -q 'Same canonical listen URL still inside last 7 days raises' src/app/rules/page.tsx \
  || fail "rules must name last-7-days raise identity"
grep -q 'weekId</code> stays an audit label — not raise identity' src/app/rules/page.tsx \
  || fail "rules must keep weekId as an audit label"
if grep -qi 'same UTC week raises' src/app/rules/page.tsx; then
  fail "rules must not tax raise identity as the UTC week"
fi
grep -q 'Monday 00:00:00.000 UTC' src/app/rules/page.tsx || fail "rules must state weekly UTC reset"
grep -q 'Rolling last 7 days. Not Monday 00:00 UTC.' src/app/rules/page.tsx \
  || fail "rules must name the rolling last-7-days window"
grep -q 'empty open is last 7 days from a paid claim' src/app/rules/page.tsx \
  || fail "rules must say the empty open is last 7 days, not Monday 00:00 UTC"
grep -q 'No fake streams' src/app/rules/page.tsx || fail "rules must forbid fake streams"
grep -q 'No invented play counts' src/app/rules/page.tsx || fail "rules must forbid invented play counts"
grep -q 'utm_' src/core/url.ts || fail "url.ts must strip utm_ tracking keys"
grep -q 'url_forbidden' src/core/url.ts || fail "url.ts must reject forbidden URLs"
grep -q 't.me' src/core/url.ts || fail "url.ts must reject telegram invites"
grep -q 'export function canonicalizeListenUrl' src/core/url.ts \
  || fail "url.ts must export canonicalizeListenUrl"
grep -q 'export function playbackForListing' src/core/playback.ts \
  || fail "playback.ts must export playbackForListing"
grep -q 'kind: "empty"' src/core/playback.ts || fail "empty week must have no playback"
grep -q 'incrementListingClicks' 'src/app/click/[id]/route.ts' \
  || fail "click route must increment public clicks"
grep -q 'NextResponse.redirect' 'src/app/click/[id]/route.ts' \
  || fail "click route must 302 to the listen URL"
grep -q 'listenClickPath' src/app/page.tsx || fail "board listen CTA must use the click route"
grep -q 'playbackForListing' src/app/page.tsx || fail "board must use real playback"
grep -q 'utm_source' tests/listing.test.ts || fail "listing tests must cover tracking strip"
grep -q 't.me' tests/listing.test.ts || fail "listing tests must reject telegram"
grep -q 'play_count_forbidden' tests/listing.test.ts \
  || fail "listing tests must reject invented play counts"
grep -q '302' tests/click.test.ts || fail "click tests must assert 302"
grep -q 'plays' tests/click.test.ts || fail "click tests must refuse play labels"
grep -q 'empty week has no player' tests/playback.test.ts \
  || fail "playback tests must cover empty week"
if grep -RInE '1\.2M streams' \
  src/app/about/page.tsx src/app/rules/page.tsx src/core/playback.ts
then
  fail "about/rules/playback must not invent play counts"
fi

if [[ -f package.json ]]; then
  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_API_BASE POLAR_PRODUCT_ID
  export POLAR_FIXTURE_ONLY=1
  [[ "${POLAR_LIVE:-}" != "1" ]] || fail "POLAR_LIVE must stay unset in test.sh"

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== unit tests =="
  test_log="$(mktemp)"
  trap 'rm -f "$test_log"' EXIT
  set +e
  npx tsx --test --test-concurrency=1 --test-reporter spec 'tests/**/*.test.ts' | tee "$test_log"
  test_status=${PIPESTATUS[0]}
  set -e
  [[ $test_status -eq 0 ]] || fail "unit tests failed"
  grep -Eq 'tests[[:space:]]+[1-9][0-9]*' "$test_log" \
    || fail "test runner reported 0 tests"
  grep -q '/healthz' "$test_log" \
    || fail "healthz test did not run"
  grep -q 'empty week' "$test_log" \
    || fail "rank/board empty-week test did not run"
  grep -q 'fixture create' "$test_log" \
    || fail "checkout fixture test did not run"
  grep -q 'abandoned checkout' "$test_log" \
    || fail "abandoned checkout test did not run"
  grep -q 'underbid' "$test_log" \
    || fail "checkout underbid test did not run"
  grep -q 'raises' "$test_log" \
    || fail "raise-bid test did not run"
  grep -q 'bid_not_higher' "$test_log" \
    || fail "bid_not_higher test did not run"
  grep -q 'utm_source' "$test_log" \
    || fail "url tracking-strip test did not run"
  grep -q 'telegram' "$test_log" \
    || fail "chat-ban test did not run"
  grep -q 'GET /click' "$test_log" \
    || fail "click route test did not run"
  grep -q 'empty week has no player' "$test_log" \
    || fail "playback empty-week test did not run"
  grep -q 'about and rules' "$test_log" \
    || fail "about/rules copy test did not run"
  grep -q 'live-smoke is operator-only' "$test_log" \
    || fail "live-smoke offline guard test did not run"
  grep -q 'station desk is a unique opening-song surface' "$test_log" \
    || fail "product-ui station desk test did not run"
  grep -q 'player exists only for paid #1' "$test_log" \
    || fail "product-ui paid opening-song test did not run"
  grep -q 'opening song lives once on the studio deck' "$test_log" \
    || fail "product-ui first-artist no-duplicate-#1 test did not run"
  grep -q 'empty week does not claim the studio stays dark' "$test_log" \
    || fail "first-time listener empty-week honesty test did not run"
  grep -q 'one certain way to hear' "$test_log" \
    || fail "first-time listener hear-#1 test did not run"
  grep -q 'first-time artist claiming the opening song' "$test_log" \
    || fail "first-time artist claim-opening test did not run"
  grep -q 'occupied listen is the first read' "$test_log" \
    || fail "first-time listener occupied hear-first test did not run"
  grep -q 'raising after listen-first' "$test_log" \
    || fail "first-time artist raise-after-hear test did not run"
  grep -q 'occupied hear is the first click' "$test_log" \
    || fail "first-time listener hear-after-raise test did not run"
  grep -q 'occupied raise after Hear-first' "$test_log" \
    || fail "first-time artist raise-after-hear-first test did not run"
  grep -q 'occupied hear after the named raise' "$test_log" \
    || fail "first-time listener hear-after-difference test did not run"
  grep -q 'occupied hear is one first Hear' "$test_log" \
    || fail "first-time listener one-first Hear test did not run"
  grep -q 'occupied Need $N after one Hear is certain' "$test_log" \
    || fail "first-time artist Need-after-Hear test did not run"
  grep -q 'occupied hear after Need $N is certain' "$test_log" \
    || fail "first-time listener hear-after-need test did not run"
  grep -q 'occupied Need $N after Hear is re-concentrated is certain' "$test_log" \
    || fail "first-time artist Need-after-Hear-two test did not run"
  grep -q 'occupied hear after Need $N is re-concentrated is certain' "$test_log" \
    || fail "first-time listener hear-after-need-two test did not run"
  grep -q 'occupied Need $N after Hear is re-concentrated again is certain' "$test_log" \
    || fail "first-time artist Need-after-Hear-three test did not run"
  grep -q 'occupied hear after Need $N is re-concentrated again is certain' "$test_log" \
    || fail "first-time listener hear-after-need-three test did not run"
  grep -q 'occupied Need $N after Hear is re-concentrated again after a louder Hear is certain' "$test_log" \
    || fail "first-time artist Need-after-Hear-four test did not run"
  grep -q 'occupied hear after Need $N is re-concentrated again after a louder Need is certain' "$test_log" \
    || fail "first-time listener hear-after-need-four test did not run"
  grep -q 'occupied Need $N after Hear is re-concentrated again after a louder Hear again is certain' "$test_log" \
    || fail "first-time artist Need-after-Hear-five test did not run"
  grep -q 'occupied hear after Need $N is re-concentrated again after a louder Need again is certain' "$test_log" \
    || fail "first-time listener hear-after-need-five test did not run"
  grep -q 'occupied #1 track title reads first and larger than $bid and clicks' "$test_log" \
    || fail "first-time listener prize-before-price test did not run"
  grep -q 'empty week stays Bid USD / $5 and does not invent Hear' "$test_log" \
    || fail "first-time listener empty Bid USD / \$5 test did not run"
  grep -q 'occupied #1 playback is real and does not invent play counts' "$test_log" \
    || fail "first-time listener real-playback test did not run"
  grep -q 'occupied #1 $bid stays a later fact and does not shout beside the song title' "$test_log" \
    || fail "first-time listener later-fact \$bid test did not run"
  grep -q 'empty week stays Bid USD / $5 — song-prize / Hear cannot leak' "$test_log" \
    || fail "first-time listener empty isolation test did not run"
  grep -q 'occupied Hear is the first click — Need $N is not a muted twin' "$test_log" \
    || fail "first-time listener Need-not-twin composition test did not run"
  grep -q 'empty week has one first click — Claim #1, then the listen URL' "$test_log" \
    || fail "first-time artist empty one-first click test did not run"
  grep -q 'occupied later tracks stay quieter than the opening song' "$test_log" \
    || fail "occupied later-rank quiet leftover test did not run"
  grep -q 'prize stays first' "$test_log" \
    || fail "later-rank prize-stays-first leftover test did not run"
  grep -q 'unpaid stays off the station desk' "$test_log" \
    || fail "unpaid-off station desk leftover test did not run"
  grep -q 'unpaid Polar checkout never ranks as #1' "$test_log" \
    || fail "unpaid Polar checkout rank leftover test did not run"
  grep -q 'unpaid Polar checkout stays off the station desk until Polar reports paid' "$test_log" \
    || fail "unpaid Polar checkout leftover test did not run"
  grep -q 'occupied week window is rolling last-7-days' "$test_log" \
    || fail "occupied rolling last-7-days leftover test did not run"
  grep -q 'empty station copy is a rolling last-7-days window' "$test_log" \
    || fail "empty last-7-days station copy test did not run"
  grep -Fq 'rolling last-7-days window is 7 * 24h' "$test_log" \
    || fail "week tests must cover rolling last-7-days window"
  grep -q 'Monday 00:00 UTC does not drop a bid still inside the rolling week' "$test_log" \
    || fail "week tests must keep a Sunday pay across Monday midnight"
  grep -q 'same listen URL still inside last-7-days raises after the UTC week label rolls' "$test_log" \
    || fail "Sunday pay Monday raise leftover test did not run"
  grep -q 'occupied /rules raise identity is last-7-days, not the UTC week label' "$test_log" \
    || fail "occupied raise-identity rules leftover test did not run"
  grep -q 'occupied Hear / later tracks name last-7-days' "$test_log" \
    || fail "occupied Hear / later tracks last-7-days leftover test did not run"
fi

echo "OK: buildable and testable"
