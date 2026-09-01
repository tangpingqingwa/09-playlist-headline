#!/usr/bin/env bash
# Verify the exact production build through Next's real start server.
# This is deliberately fixture-only and uses a disposable durable SQLite file.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  if [[ -n "${log_path:-}" && -f "${log_path}" ]]; then
    echo "next start log:" >&2
    cat "${log_path}" >&2 || true
  fi
  exit 1
}

command -v curl >/dev/null || fail "curl is required for the built-runtime check"
command -v node >/dev/null || fail "node is required for the built-runtime check"
[[ -x "${root}/node_modules/.bin/next" ]] || fail "next executable is missing"
[[ -d "${root}/.next" ]] || fail "production build output .next is missing"

workdir="$(mktemp -d "${TMPDIR:-/tmp}/playlist-headline-built.XXXXXX")"
db_path="${workdir}/board.sqlite"
log_path="${workdir}/next-start.log"
server_pid=""

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${server_pid}" ]]; then
    kill_tree "${server_pid}"
    wait "${server_pid}" 2>/dev/null || true
  fi
  if [[ -n "${workdir}" && -d "${workdir}" ]]; then
    rm -rf -- "${workdir}"
  fi
}
trap cleanup EXIT

port="$(node --input-type=module -e '
  import net from "node:net";
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") process.exit(1);
    process.stdout.write(String(address.port));
    server.close();
  });
')"
base="http://127.0.0.1:${port}"

(
  cd "$root"
  exec env \
    -u WAFFO_MODE \
    -u WAFFO_API_BASE \
    -u WAFFO_MERCHANT_ID \
    -u WAFFO_STORE_ID \
    -u WAFFO_PRODUCT_ID \
    -u WAFFO_PRIVATE_KEY \
    -u WAFFO_PRIVATE_KEY_FILE \
    -u WAFFO_WEBHOOK_PUBLIC_KEY \
    -u WAFFO_WEBHOOK_TEST_PUBLIC_KEY \
    -u WAFFO_WEBHOOK_PROD_PUBLIC_KEY \
    -u DATABASE_PATH \
    -u PUBLIC_BASE_URL \
    -u NEXT_PHASE \
    -u VERCEL_ENV \
    -u APP_ENV \
    -u DEPLOY_ENV \
    -u BUILD_ENV \
    NODE_ENV=test \
    NEXT_TELEMETRY_DISABLED=1 \
    WAFFO_MODE=fixture \
    DATABASE_PATH="$db_path" \
    PUBLIC_BASE_URL="$base" \
    PORT="$port" \
    npm start -- --hostname 127.0.0.1 --port "$port"
) >"$log_path" 2>&1 &
server_pid="$!"

health_url="${base}/healthz"
ready=0
for _ in $(seq 1 120); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  if curl -fsS --connect-timeout 2 --max-time 5 "$health_url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
[[ "$ready" == 1 ]] || fail "next start did not answer ${health_url}"

health_body="${workdir}/healthz.json"
health_code="$(curl -sS -o "$health_body" -w '%{http_code}' --connect-timeout 5 --max-time 10 "$health_url" || true)"
[[ "$health_code" == "200" ]] || fail "GET /healthz returned HTTP ${health_code}"
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const value = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (value?.ok !== true) process.exit(1);
' "$health_body" || fail "GET /healthz did not return { ok: true }"

board_body="${workdir}/board.html"
board_code="$(curl -sS -o "$board_body" -w '%{http_code}' --connect-timeout 5 --max-time 20 "${base}/" || true)"
[[ "$board_code" == "200" ]] || fail "GET / returned HTTP ${board_code}"
grep -Fq 'station-desk' "$board_body" || fail "GET / did not render the station desk"
[[ -f "$db_path" ]] || fail "built runtime did not open the temporary durable SQLite path"

if grep -Eqi 'api\.waffo\.ai|waffo checkout request' "$log_path"; then
  fail "fixture built-runtime check emitted a provider request marker"
fi

stop_pid="$server_pid"
server_pid=""
kill_tree "$stop_pid"
wait "$stop_pid" 2>/dev/null || true
echo "OK: built next start served /healthz 200 { ok: true } and / 200 in explicit fixture mode; provider calls=0"
