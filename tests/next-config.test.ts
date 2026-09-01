import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config";

test("preview config hides Next dev indicators and keeps SQLite external", () => {
  assert.equal(nextConfig.devIndicators, false);
  assert.deepEqual(nextConfig.serverExternalPackages, ["better-sqlite3"]);
});
