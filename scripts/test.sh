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
grep -q 'listPaidForWeek' src/core/rank.ts \
  || fail "live board must read paid listings only"
grep -q 'isoWeekId' src/core/week.ts || fail "week.ts missing isoWeekId"
grep -q 'Monday' src/core/week.ts || fail "week.ts must document Monday UTC reset"
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
grep -q 'Hear this week' src/app/page.tsx \
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
grep -q 'className="need-after-hear"' src/app/page.tsx \
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
if grep -A20 '.need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
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
grep -q 'className="listen opening-listen hear-after-need"' src/app/page.tsx \
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
grep -q 'className="need-after-hear"' src/app/page.tsx \
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
if grep -A20 '.need-after-hear {' src/app/board.css | grep -q 'background: var(--ink)'; then
  fail "Need \$N must stay the raise hop, not a second filled Hear pill"
fi
hear_after_need_rule="$(awk '/\.opening-listen\.hear-after-need \{/,/\}/' src/app/board.css)"
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
  || fail "store.ts must look up the same listen URL this week"
grep -q 'kind: quote.kind' src/app/api/checkout/route.ts \
  || fail "checkout raise path must pass create or raise"
grep -q 'quoteBid' src/app/api/checkout/route.ts \
  || fail "checkout must charge the raise difference"
grep -q 'bid_not_higher' tests/checkout.test.ts \
  || fail "checkout tests must cover bid_not_higher"
grep -q 'pays \$7' tests/checkout.test.ts \
  || fail "checkout tests must cover SPEC acceptance 5"
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
grep -q 'Monday 00:00:00.000 UTC' src/app/rules/page.tsx || fail "rules must state weekly UTC reset"
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
fi

echo "OK: buildable and testable"
