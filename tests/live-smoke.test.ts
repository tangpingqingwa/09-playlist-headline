import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("live-smoke.sh is executable and operator-only", () => {
  const scriptPath = join(root, "scripts/live-smoke.sh");
  assert.equal(existsSync(scriptPath), true);
  assert.equal(statSync(scriptPath).mode & 0o111, 0o111, "scripts/live-smoke.sh must be executable");

  const script = read("scripts/live-smoke.sh");
  assert.match(script, /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/);
  assert.match(script, /POLAR_LIVE/);
  assert.match(script, /live-smoke refuses CI=true/);
  assert.match(script, /live-smoke must not run in GitHub Actions/);
  assert.match(script, /GET \/healthz/);
  assert.match(script, /GET \/about/);
  assert.match(script, /GET \/rules/);
  assert.match(script, /Older wins ties/);
  assert.match(script, /Raise pays difference/);
  assert.match(script, /\/api\/checkout/);
  assert.match(script, /\/click\//);
  assert.match(script, /data-listen-url/);
  assert.match(script, /youtube.com\/embed/);
  assert.match(script, /generated\\.mp3/);
  assert.doesNotMatch(script, /invented paid opening song/);
});

test("docs/live-smoke.md records verdict labels and is not a paid-rank invention", () => {
  const docs = read("docs/live-smoke.md");
  assert.match(docs, /PASS/);
  assert.match(docs, /PASS-ERROR/);
  assert.match(docs, /BLOCKED-SECRET/);
  assert.match(docs, /FAIL/);
  assert.match(docs, /scripts\/live-smoke\.sh/);
  assert.match(docs, /not called from `scripts\/test\.sh`/i);
  assert.match(docs, /POLAR_ACCESS_TOKEN/);
  assert.doesNotMatch(docs, /1\.2M streams/);
  assert.doesNotMatch(docs, /invented paid opening/);
});

test("scripts/test.sh and CI stay offline and do not invoke live-smoke", () => {
  const testSh = read("scripts/test.sh");
  const ci = read(".github/workflows/ci.yml");

  assert.doesNotMatch(testSh, /^\s*(bash )?(\.\/)?scripts\/live-smoke\.sh/m);
  assert.doesNotMatch(testSh, /^[[:space:]]*(export[[:space:]]+)?POLAR_LIVE=1/m);
  assert.match(testSh, /must not invoke live-smoke/);
  assert.match(testSh, /unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET/);
  assert.match(testSh, /POLAR_FIXTURE_ONLY=1/);

  assert.doesNotMatch(ci, /live-smoke/);
  assert.doesNotMatch(ci, /POLAR_LIVE/);
  assert.doesNotMatch(ci, /POLAR_ACCESS_TOKEN/);
  assert.match(ci, /bash scripts\/test\.sh/);
});
