import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { GET, healthResponse } from "../src/app/healthz/route";
import { HEALTHZ_PATH } from "../src/app/route-paths";
import { probeRuntimeReadiness } from "../src/runtime/readiness";

test("GET /healthz returns 200 { ok: true }", async () => {
  assert.equal(HEALTHZ_PATH, "/healthz");

  const response = GET();
  const contentType = response.headers.get("content-type") ?? "";

  assert.equal(response.status, 200);
  assert.match(contentType, /^application\/json\b/);
  assert.deepEqual(await response.json(), { ok: true });
});

test("health readiness fails closed for a live mode with incomplete provider config", async () => {
  const response = healthResponse({ WAFFO_MODE: "waffo-prod" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "configuration_unavailable",
  });
});

test("runtime readiness opens, migrates, and answers a trivial durable query", () => {
  const root = mkdtempSync(join(tmpdir(), "playlist-readiness-"));
  try {
    const path = join(root, "board.sqlite");
    assert.equal(
      probeRuntimeReadiness({ WAFFO_MODE: "fixture", DATABASE_PATH: path }),
      "fixture",
    );
    const response = healthResponse({ WAFFO_MODE: "fixture", DATABASE_PATH: path });
    assert.equal(response.status, 200);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("health readiness fails closed for an invalid configured database", async () => {
  const root = mkdtempSync(join(tmpdir(), "playlist-readiness-invalid-"));
  try {
    const notDirectory = join(root, "not-a-directory");
    writeFileSync(notDirectory, "not a directory");
    const response = healthResponse({
      WAFFO_MODE: "fixture",
      DATABASE_PATH: join(notDirectory, "board.sqlite"),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "configuration_unavailable",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
