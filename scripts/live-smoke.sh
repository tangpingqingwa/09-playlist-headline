#!/usr/bin/env bash
# Operator smoke against a local process. Not called from scripts/test.sh or CI.
# Walks board, about/rules, fixture checkout, click,
# and real playback through the compiled `next start` runtime. The disposable
# process uses file-backed SQLite and explicit fixture mode; it never calls
# Waffo. An explicitly requested live mode is blocked as
# BLOCKED-CONFIG: WAFFO_MODE before any process starts. Do not invent a paid
# opening track or a fake stream.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if [[ -n "${LIVE_SMOKE_BASE:-}" ]]; then
  echo "BLOCKED-CONFIG: LIVE_SMOKE_BASE is not supported by this offline fixture gate; no process started" >&2
  exit 2
fi

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  fail "live-smoke must not run in GitHub Actions"
fi
if [[ "${CI:-}" == "true" && "${LIVE_SMOKE_ALLOW_CI:-}" != "1" ]]; then
  fail "live-smoke refuses CI=true"
fi

OP_WAFFO_MODE="${WAFFO_MODE:-}"
case "${OP_WAFFO_MODE}" in
  ""|fixture)
    ;;
  waffo-test|waffo-prod)
    echo "BLOCKED-CONFIG: WAFFO_MODE=${OP_WAFFO_MODE} live provider smoke is not enabled by this offline fixture gate; no process started" >&2
    exit 2
    ;;
  *)
    echo "BLOCKED-CONFIG: WAFFO_MODE must be fixture for this offline smoke; no process started" >&2
    exit 2
    ;;
esac

command -v curl >/dev/null || fail "curl is required"
command -v node >/dev/null || fail "node is required"

node_major="$(node --input-type=module -e 'process.stdout.write(String(Number(process.versions.node.split(".")[0])))')"
[[ "${node_major}" -ge 22 ]] || fail "Node 22+ is required (found ${node_major})"

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

[[ -x "${root}/node_modules/.bin/next" ]] || fail "next executable is missing"
[[ -d "${root}/.next" ]] || fail "production build output .next is missing; run npm run build first"

PASS=0
PASS_ERROR=0
BLOCKED=0
FAIL=0
STARTED_PID=""
WORKDIR=""
RESULT_LOG=""
BASE=""

kill_tree() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 0
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${STARTED_PID}" ]]; then
    kill_tree "${STARTED_PID}"
    wait "${STARTED_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]]; then
    rm -rf "${WORKDIR}"
  fi
}
trap cleanup EXIT

record() {
  local flow="$1"
  local status="$2"
  local note="${3:-}"
  printf 'RESULT\t%s\t%s\t%s\n' "$flow" "$status" "$note"
  if [[ -n "${RESULT_LOG}" ]]; then
    printf '%s\t%s\t%s\n' "$flow" "$status" "$note" >>"${RESULT_LOG}"
  fi
  case "$status" in
    PASS) PASS=$((PASS + 1)) ;;
    PASS-ERROR) PASS_ERROR=$((PASS_ERROR + 1)) ;;
    BLOCKED-SECRET) BLOCKED=$((BLOCKED + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    *) fail "unknown smoke status ${status}" ;;
  esac
}

pick_port() {
  node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") process.exit(1);
      process.stdout.write(String(addr.port));
      server.close();
    });
  '
}

current_week_id() {
  node --input-type=module -e '
    const now = new Date();
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = cursor.getUTCDay() || 7;
    cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
    const isoYear = cursor.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil(((cursor.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    process.stdout.write(`${isoYear}-W${String(week).padStart(2, "0")}`);
  '
}

wait_health() {
  local url="$1/healthz"
  local i
  for i in $(seq 1 80); do
    if curl -fsS --connect-timeout 2 --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

start_smoke_server() {
  local port="$1"
  local log_path="$2"
  (
    cd "$root"
    unset WAFFO_MODE WAFFO_API_BASE WAFFO_TIMEOUT_MS WAFFO_MERCHANT_ID \
      WAFFO_STORE_ID WAFFO_PRODUCT_ID WAFFO_PRODUCT_NAME \
      WAFFO_PRIVATE_KEY WAFFO_PRIVATE_KEY_FILE \
      WAFFO_WEBHOOK_PUBLIC_KEY WAFFO_WEBHOOK_TEST_PUBLIC_KEY \
      WAFFO_WEBHOOK_PROD_PUBLIC_KEY DATABASE_PATH PUBLIC_BASE_URL \
      NODE_ENV NEXT_PHASE VERCEL_ENV APP_ENV DEPLOY_ENV BUILD_ENV || true
    export WAFFO_MODE=fixture
    export DATABASE_PATH="${WORKDIR}/fixture.sqlite"
    export PORT="${port}"
    export PUBLIC_BASE_URL="http://127.0.0.1:${port}"
    export NODE_ENV=test
    export NEXT_TELEMETRY_DISABLED=1
    exec npm start -- --hostname 127.0.0.1 --port "$port"
  ) >"${log_path}" 2>&1 &
  echo $!
}

http_get() {
  local base="$1"
  local path="$2"
  local out="$3"
  curl -sS -o "$out" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    "${base}${path}"
}

http_get_headers() {
  local base="$1"
  local path="$2"
  local body="$3"
  local hdrs="$4"
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    --max-redirs 0 \
    "${base}${path}"
}

http_post_json() {
  local base="$1"
  local path="$2"
  local payload="$3"
  local body="$4"
  local hdrs="$5"
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 30 \
    --max-redirs 0 \
    -X POST \
    -H "content-type: application/json" \
    -H "accept: application/json" \
    --data "$payload" \
    "${base}${path}"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS = ": " }
    tolower($1) == name {
      val = $0
      sub(/^[^:]+:[ \t]*/, "", val)
      gsub(/\r/, "", val)
      print val
      exit
    }
  ' "$file"
}

json_field() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const raw = readFileSync(process.argv[1], "utf8");
    let data;
    try { data = JSON.parse(raw); } catch { process.exit(2); }
    const key = process.argv[2];
    const value = data == null ? undefined : data[key];
    if (value === undefined || value === null) process.exit(3);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      process.stdout.write(String(value));
      process.exit(0);
    }
    process.stdout.write(JSON.stringify(value));
  ' "$1" "$2"
}

html_has() {
  local file="$1"
  local pattern="$2"
  grep -Eq "$pattern" "$file"
}

html_has_fixed() {
  local file="$1"
  local needle="$2"
  grep -Fq "$needle" "$file"
}

fake_stream_or_play_count() {
  local file="$1"
  grep -Eiq 'play count|monthly listeners|1\.2M streams|<audio|waveform|generated\.mp3|data:audio' "$file"
}

listing_count() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    process.stdout.write(String([...html.matchAll(/data-listing-card/g)].length));
  ' "$1"
}

first_listing_id() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const match = html.match(/data-id="([^"]+)"/);
    if (!match) process.exit(2);
    process.stdout.write(match[1]);
  ' "$1"
}

first_listen_url() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const match = html.match(/data-listen-url="([^"]+)"/);
    if (!match) process.exit(2);
    process.stdout.write(match[1]);
  ' "$1"
}

clicks_for_id() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const id = process.argv[2];
    const re = new RegExp(
      `data-id="${id}"[\\s\\S]*?<span class="clicks[^\"]*"[^>]*>\\s*(\\d+) click`,
    );
    const match = html.match(re);
    if (!match) process.exit(2);
    process.stdout.write(match[1]);
  ' "$1" "$2"
}

WORKDIR="$(mktemp -d "${root}/.live-smoke.XXXXXX")"
RESULT_LOG="${WORKDIR}/results.tsv"
: >"${RESULT_LOG}"
STAMP="$(date -u +%Y%m%d%H%M%S)"
WEEK_ID="$(current_week_id)"
STRIPPED_LISTEN_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
LISTEN_URL="${STRIPPED_LISTEN_URL}&utm_source=smoke&si=abc"
TRACK_NAME="Smoke Open ${STAMP}"
echo "== live-smoke (operator only; not CI) =="
echo "root=${root}"
echo "weekId=${WEEK_ID}"

PORT="${LIVE_SMOKE_PORT:-$(pick_port)}"
BASE="http://127.0.0.1:${PORT}"
LOG_PATH="${WORKDIR}/server.log"
echo "starting local fixture process on ${BASE}"
STARTED_PID="$(start_smoke_server "$PORT" "$LOG_PATH")"
if ! wait_health "$BASE"; then
  echo "server log:" >&2
  cat "${LOG_PATH}" >&2 || true
  fail "local server did not become healthy at ${BASE}/healthz"
fi

if [[ ! -f "${WORKDIR}/fixture.sqlite" ]]; then
  fail "fixture runtime did not open the disposable file-backed SQLite database"
fi

echo "base=${BASE}"
echo "operator WAFFO_MODE=${OP_WAFFO_MODE:-<unset>} (local smoke forces fixture)"
echo "provider network calls=0"

# --- healthz ---
health_body="${WORKDIR}/healthz.json"
health_code="$(http_get "$BASE" "/healthz" "$health_body" || true)"
if [[ "$health_code" == "200" ]] && grep -q '"ok":true' "$health_body"; then
  record "healthz" "PASS" "GET /healthz 200 { ok: true }"
else
  record "healthz" "FAIL" "GET /healthz HTTP ${health_code}"
fi

# --- board: rolling last 7 days, no invented play counts, no fake stream ---
board0="${WORKDIR}/board0.html"
board0_code="$(http_get "$BASE" "/" "$board0" || true)"
if [[ "$board0_code" != "200" ]]; then
  record "board" "FAIL" "GET / HTTP ${board0_code}"
elif ! html_has "$board0" 'data-week="'"${WEEK_ID}"'"' \
  || ! html_has "$board0" 'name="track"' \
  || ! html_has "$board0" 'name="artist"' \
  || ! html_has "$board0" 'name="listenUrl"' \
  || ! html_has "$board0" 'name="amountUsd"' \
  || ! html_has "$board0" 'Claim rank'; then
  record "board" "FAIL" "GET / missing current UTC week label or bid form"
elif fake_stream_or_play_count "$board0"; then
  record "board" "FAIL" "GET / invented play counts or fake stream"
elif html_has "$board0" 'data-empty-week="true"' && html_has "$board0" 'No opening song'; then
  if html_has "$board0" 'data-opening-song="true"' \
    || html_has "$board0" 'data-listing-card' \
    || ! html_has "$board0" 'data-empty-window'; then
    record "board" "FAIL" "empty board exposed a paid opening marker or player"
  elif html_has "$board0" 'Last 7 days' \
    && html_has "$board0" 'not Monday midnight UTC' \
    && html_has_fixed "$board0" 'Rolling last 7 days. Not Monday 00:00 UTC.'; then
    record "board" "PASS" "GET / 200 week ${WEEK_ID} empty last 7 days (not Monday midnight) + bid form"
  else
    record "board" "FAIL" "empty week missing last-7-days copy or still expires at Monday reset"
  fi
else
  count="$(listing_count "$board0")"
  if [[ "$count" -gt 0 ]] && html_has "$board0" 'data-opening-song="true"' \
    && html_has "$board0" 'data-rolling-week' \
    && html_has "$board0" 'Rolling last 7 days. Not Monday 00:00 UTC.'; then
    record "board" "PASS" "GET / 200 week ${WEEK_ID}; rolling last 7 days; ${count} already-paid row(s) (not seeded by smoke)"
  else
    record "board" "FAIL" "GET / 200 but empty/paid board contract broken"
  fi
fi

# --- about / rules ---
about_body="${WORKDIR}/about.html"
about_code="$(http_get "$BASE" "/about" "$about_body" || true)"
rules_body="${WORKDIR}/rules.html"
rules_code="$(http_get "$BASE" "/rules" "$rules_body" || true)"
if [[ "$about_code" == "200" && "$rules_code" == "200" ]] \
  && html_has "$about_body" 'Rank is the bid' \
  && html_has "$about_body" 'Playback is real' \
  && html_has "$about_body" 'no fake streams' \
  && html_has "$about_body" 'no invented play counts' \
  && html_has "$about_body" 'Playlist Headline is a public auction' \
  && html_has "$about_body" 'Read the rules' \
  && html_has "$about_body" 'seven-day placement window' \
  && ! html_has "$about_body" 'weekly reset' \
  && html_has "$about_body" 'public auction last 7 days' \
  && html_has "$rules_body" '\$5' \
  && html_has "$rules_body" 'track placed first keeps the higher rank' \
  && html_has "$rules_body" 'same cleaned listen link may raise' \
  && html_has "$rules_body" 'Each placement keeps its own seven-day window' \
  && html_has "$rules_body" 'No fake streams' \
  && html_has "$rules_body" 'No invented play counts'; then
  record "about-rules" "PASS" "GET /about and /rules 200; min \$5 / earlier tie / raise difference / seven-day window / no fake streams"
else
  record "about-rules" "FAIL" "about HTTP ${about_code} rules HTTP ${rules_code}"
fi

# --- documented product error (not a paid rank) ---
min_body="${WORKDIR}/min.json"
min_hdrs="${WORKDIR}/min.hdrs"
min_code="$(http_post_json "$BASE" "/api/checkout" \
  "{\"track\":\"${TRACK_NAME}\",\"artist\":\"Smoke Artist\",\"listenUrl\":\"${STRIPPED_LISTEN_URL}\",\"amountUsd\":4}" \
  "$min_body" "$min_hdrs" || true)"
min_err="$(json_field "$min_body" "error" || true)"
board_min="${WORKDIR}/board-min.html"
http_get "$BASE" "/" "$board_min" >/dev/null || true
if [[ "$min_code" == "400" && "$min_err" == "bid_below_min" ]] \
  && ! html_has "$board_min" "$TRACK_NAME"; then
  record "bid-below-min" "PASS-ERROR" "POST /api/checkout \$4 → 400 bid_below_min; board unchanged"
else
  record "bid-below-min" "FAIL" "\$4 checkout HTTP ${min_code} error=${min_err}"
fi

# --- provider boundary: this smoke is deliberately no-live ---
echo "== create checkout (explicit fixture; Waffo network disabled) =="
record "create-checkout" "PASS-ERROR" "WAFFO_MODE=fixture; production Waffo remains blocked without WAFFO_MERCHANT_ID"

# --- fixture listing for click + playback ---
# A fixture webhook is the authoritative settlement; the browser return never
# settles a listing by itself.
fix_body="${WORKDIR}/fixture.json"
fix_hdrs="${WORKDIR}/fixture.hdrs"
fix_code="$(http_post_json "$BASE" "/api/checkout" \
  "{\"track\":\"${TRACK_NAME}\",\"artist\":\"Smoke Artist\",\"listenUrl\":\"${LISTEN_URL}\",\"amountUsd\":5}" \
  "$fix_body" "$fix_hdrs" || true)"
fix_session="$(json_field "$fix_body" "sessionId" || true)"
board_unpaid="${WORKDIR}/board-unpaid.html"
http_get "$BASE" "/" "$board_unpaid" >/dev/null || true

if [[ "$fix_code" != "200" || -z "$fix_session" ]]; then
  record "click" "FAIL" "fixture checkout HTTP ${fix_code} (needed for click hop)"
  record "playback" "FAIL" "fixture checkout HTTP ${fix_code} (needed for stored listen URL)"
elif html_has "$board_unpaid" "$TRACK_NAME"; then
  record "click" "FAIL" "unpaid fixture checkout appeared on the board"
  record "playback" "FAIL" "unpaid fixture checkout invented an opening song"
else
  settle_body="${WORKDIR}/fixture-settle.json"
  settle_hdrs="${WORKDIR}/fixture-settle.hdrs"
  settle_code="$(http_post_json "$BASE" "/api/waffo/webhook" \
    "{\"type\":\"order.completed\",\"data\":{\"checkoutId\":\"${fix_session}\",\"status\":\"succeeded\",\"eventId\":\"fixture-${STAMP}\",\"paymentId\":\"fixture-payment-${STAMP}\",\"orderId\":\"fixture-order-${STAMP}\"}}" \
    "$settle_body" "$settle_hdrs" || true)"
  if [[ "$settle_code" != "200" ]] || ! grep -q '"applied":true' "$settle_body"; then
    record "settlement" "FAIL" "fixture order.completed HTTP ${settle_code} did not apply"
  else
    record "settlement" "PASS" "fixture order.completed applied; browser return remains read-only"
  fi
  fix_session_q="$(node --input-type=module -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$fix_session")"
  return_body="${WORKDIR}/return.html"
  return_code="$(http_get "$BASE" "/return?sessionId=${fix_session_q}" "$return_body" || true)"
  board1="${WORKDIR}/board1.html"
  board1_code="$(http_get "$BASE" "/" "$board1" || true)"
  listing_id="$(first_listing_id "$board1" || true)"
  stored_url="$(first_listen_url "$board1" || true)"

  if [[ "$return_code" != "200" ]] || ! html_has "$return_body" 'data-return="paid"'; then
    record "click" "FAIL" "fixture return HTTP ${return_code} did not pay"
    record "playback" "FAIL" "fixture return HTTP ${return_code} did not pay"
  elif [[ "$board1_code" != "200" || -z "${listing_id}" || -z "${stored_url}" ]]; then
    record "click" "FAIL" "no fixture listing id for click (live pay blocked; fixture path required)"
    record "playback" "FAIL" "no stored listen URL on the board"
  else
    before_clicks="$(clicks_for_id "$board1" "$listing_id" || echo "")"
    click_body="${WORKDIR}/click.body"
    click_hdrs="${WORKDIR}/click.hdrs"
    click_code="$(http_get_headers "$BASE" "/click/${listing_id}" "$click_body" "$click_hdrs" || true)"
    click_loc="$(header_value "$click_hdrs" "location" || true)"
    board2="${WORKDIR}/board2.html"
    http_get "$BASE" "/" "$board2" >/dev/null || true
    after_clicks="$(clicks_for_id "$board2" "$listing_id" || echo "")"
    if [[ "$click_code" == "302" ]] \
      && [[ "$click_loc" == "${stored_url}" || "$click_loc" == "${STRIPPED_LISTEN_URL}" ]] \
      && [[ "$before_clicks" =~ ^[0-9]+$ && "$after_clicks" =~ ^[0-9]+$ ]] \
      && [[ "$after_clicks" -eq $((before_clicks + 1)) ]]; then
      record "click" "PASS" "GET /click/${listing_id} 302 → stored URL; clicks ${before_clicks}→${after_clicks}"
    else
      record "click" "FAIL" "GET /click/${listing_id} HTTP ${click_code} loc=${click_loc} clicks ${before_clicks}→${after_clicks}"
    fi

    if fake_stream_or_play_count "$board1"; then
      record "playback" "FAIL" "board invented a fake stream"
    elif [[ "$stored_url" != "${STRIPPED_LISTEN_URL}" ]]; then
      record "playback" "FAIL" "stored listen URL is not the stripped https URL: ${stored_url}"
    elif html_has_fixed "$board1" "data-listen-url=\"${stored_url}\"" \
      && html_has_fixed "$board1" "href=\"/click/${listing_id}\"" \
      && html_has "$board1" 'data-playback="embed"' \
      && html_has "$board1" 'youtube.com/embed/dQw4w9WgXcQ'; then
      record "playback" "PASS" "official YouTube embed of stored ${stored_url}; no generated file"
    else
      record "playback" "FAIL" "listen control / embed does not target stored URL ${stored_url}"
    fi
  fi
fi

echo
echo "== summary =="
echo "PASS=${PASS} PASS-ERROR=${PASS_ERROR} BLOCKED-SECRET=${BLOCKED} FAIL=${FAIL}"
echo "base=${BASE}"
echo "weekId=${WEEK_ID}"
if [[ -f "${RESULT_LOG}" ]]; then
  echo "----"
  while IFS=$'\t' read -r flow status note; do
    printf '%-18s %-16s %s\n' "$flow" "$status" "$note"
  done <"${RESULT_LOG}"
fi

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
