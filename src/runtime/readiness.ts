import {
  assertRuntimeReadiness,
  databasePath,
  type WaffoEnv,
  type WaffoMode,
} from "../config";
import { openDatabase, type AppDb } from "../db";

/**
 * Open the configured SQLite database, run the smallest useful query, and
 * close the probe connection. The caller receives only a readiness error; no
 * path, key, or provider detail is included in this boundary.
 */
export function probeDatabase(path: string): void {
  let db: AppDb | undefined;
  try {
    db = openDatabase(path);
    const row = db.prepare("SELECT 1 AS ok").get() as { ok?: number } | undefined;
    if (row?.ok !== 1) throw new Error("database_probe_failed");
  } finally {
    db?.close();
  }
}

/** Validate live configuration and prove the configured durable store works. */
export function probeRuntimeReadiness(env: WaffoEnv = process.env): WaffoMode {
  const mode = assertRuntimeReadiness(env);
  probeDatabase(databasePath(env));
  return mode;
}
