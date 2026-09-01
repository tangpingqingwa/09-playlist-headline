import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("live-smoke is operator-only and stays off the offline gate", () => {
  const scriptPath = join(root, "scripts/live-smoke.sh");
  assert.equal(existsSync(scriptPath), true);
  assert.equal(statSync(scriptPath).mode & 0o111, 0o111, "scripts/live-smoke.sh must be executable");

  const script = read("scripts/live-smoke.sh");
  assert.match(script, /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.match(script, /WAFFO_MODE/);
  assert.match(script, /provider network calls=0/);
  assert.match(script, /live-smoke refuses CI=true/);
  assert.match(script, /live-smoke must not run in GitHub Actions/);
  assert.match(script, /GET \/healthz/);
  assert.match(script, /\/about/);
  assert.match(script, /\/rules/);
  assert.match(script, /track placed first keeps the higher rank/);
  assert.match(script, /same cleaned listen link may raise/);
  assert.match(script, /Read the rules/);
  assert.match(script, /seven-day placement window/);
  assert.match(script, /\/api\/checkout/);
  assert.match(script, /\/click\//);
  assert.match(script, /data-listen-url/);
  assert.match(script, /youtube.com\/embed/);
  assert.match(script, /generated\\.mp3/);
  assert.match(script, /npm start -- --hostname 127\.0\.0\.1 --port/);
  assert.match(script, /DATABASE_PATH=.*fixture\.sqlite/);
  assert.match(script, /NODE_ENV=test/);
  assert.match(script, /BLOCKED-CONFIG: LIVE_SMOKE_BASE/);
  const baseGuard = script.indexOf('if [[ -n "${LIVE_SMOKE_BASE:-}" ]]');
  assert.ok(baseGuard >= 0, "LIVE_SMOKE_BASE guard must be present");
  for (const sideEffect of ["command -v curl", "npm ci", "mktemp -d", "start_smoke_server"]) {
    assert.ok(baseGuard < script.indexOf(sideEffect), `LIVE_SMOKE_BASE must guard ${sideEffect}`);
  }
  assert.doesNotMatch(script, /scripts\/live-smoke-server\.ts/);
  assert.match(script, /\/api\/waffo\/webhook/);
  assert.doesNotMatch(script, /invented paid opening song/);
});

test("explicit live Waffo mode is blocked before the fixture process starts", () => {
  for (const mode of ["waffo-test", "waffo-prod"]) {
    const result = spawnSync("bash", [join(root, "scripts/live-smoke.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "",
        GITHUB_ACTIONS: "",
        WAFFO_MODE: mode,
      },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 2, `${mode} should be blocked before startup`);
    assert.match(output, new RegExp(`BLOCKED-CONFIG: WAFFO_MODE=${mode}`));
    assert.doesNotMatch(output, /runtime preflight passed|next start|starting local fixture process/);
  }
});

test("a supplied live-smoke base is rejected before the fixture process starts", () => {
  for (const ci of ["", "true"]) {
    const result = spawnSync("bash", [join(root, "scripts/live-smoke.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: ci,
        GITHUB_ACTIONS: "",
        LIVE_SMOKE_BASE: "http://127.0.0.1:9",
      },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 2, `LIVE_SMOKE_BASE should be rejected before startup (CI=${ci || "unset"})`);
    assert.match(output, /BLOCKED-CONFIG: LIVE_SMOKE_BASE/);
    assert.doesNotMatch(output, /runtime preflight passed|next start|starting local fixture process/);
  }
});

test("docs/live-smoke.md records verdict labels and is not a paid-rank invention", () => {
  const docs = read("docs/live-smoke.md");
  assert.match(docs, /PASS/);
  assert.match(docs, /PASS-ERROR/);
  assert.match(docs, /BLOCKED-SECRET/);
  assert.match(docs, /FAIL/);
  assert.match(docs, /scripts\/live-smoke\.sh/);
  assert.match(docs, /does not call.*`scripts\/test\.sh`/i);
  assert.match(docs, /compiled[\s\S]*npm start/i);
  assert.match(docs, /WAFFO_MODE=waffo-test/);
  assert.match(docs, /exits before[\s\S]*BLOCKED-CONFIG/i);
  assert.match(docs, /LIVE_SMOKE_BASE[\s\S]*BLOCKED-CONFIG/i);
  assert.doesNotMatch(docs, /1\.2M streams/);
  assert.doesNotMatch(docs, /invented paid opening/);
});

test("scripts/test.sh and CI stay offline and do not invoke live-smoke", () => {
  const testSh = read("scripts/test.sh");
  const ci = read(".github/workflows/ci.yml");

  assert.doesNotMatch(testSh, /^\s*(bash )?(\.\/)?scripts\/live-smoke\.sh/m);
  assert.match(testSh, /must not invoke live-smoke/);
  assert.match(testSh, /WAFFO_MODE=fixture/);
  assert.match(testSh, /WAFFO_MODE/);
  assert.doesNotMatch(testSh, /WAFFO_MODE=waffo-(?:test|prod)/);

  for (const selector of [
    "WAFFO_MODE",
    "WAFFO_API_BASE",
    "WAFFO_TIMEOUT_MS",
    "WAFFO_MERCHANT_ID",
    "WAFFO_STORE_ID",
    "WAFFO_PRODUCT_ID",
    "WAFFO_PRODUCT_NAME",
    "WAFFO_PRIVATE_KEY",
    "WAFFO_PRIVATE_KEY_FILE",
    "WAFFO_WEBHOOK_PUBLIC_KEY",
    "WAFFO_WEBHOOK_TEST_PUBLIC_KEY",
    "WAFFO_WEBHOOK_PROD_PUBLIC_KEY",
  ]) {
    assert.doesNotMatch(ci, new RegExp(selector), `CI must not mention ${selector}`);
  }
  assert.doesNotMatch(ci, /live-smoke/);
  assert.match(ci, /bash scripts\/test\.sh/);
});
