import { createRequire } from "node:module";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { databasePath } from "./config";

export type AppDb = import("better-sqlite3").Database;

const Database = createRequire(import.meta.url)(
  "better-sqlite3",
) as typeof import("better-sqlite3");

/**
 * Keep the schema inline because Next's server bundle does not promise to
 * copy an arbitrary SQL directory. The matching migration files are kept as
 * an operator-readable record of the schema.
 */
const DURABLE_STORE_MIGRATION = `
CREATE TABLE IF NOT EXISTS weeks (
  id TEXT PRIMARY KEY NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY NOT NULL,
  week_id TEXT NOT NULL,
  listen_key TEXT NOT NULL,
  track TEXT NOT NULL,
  artist TEXT NOT NULL,
  listen_url TEXT NOT NULL,
  claimant_token_hash TEXT,
  bid_usd INTEGER NOT NULL CHECK (bid_usd >= 1),
  first_paid_at TEXT NOT NULL,
  last_paid_at TEXT NOT NULL,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);
CREATE INDEX IF NOT EXISTS listings_paid_at_idx ON listings (first_paid_at);
CREATE INDEX IF NOT EXISTS listings_listen_key_idx ON listings (listen_key);
CREATE INDEX IF NOT EXISTS listings_week_idx ON listings (week_id);

CREATE TABLE IF NOT EXISTS checkout_intents (
  intent_id TEXT PRIMARY KEY NOT NULL,
  provider_checkout_id TEXT,
  checkout_url TEXT,
  expires_at TEXT,
  week_id TEXT NOT NULL,
  track TEXT NOT NULL,
  artist TEXT NOT NULL,
  listen_key TEXT NOT NULL,
  listen_url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('create', 'raise')),
  current_bid_cents INTEGER NOT NULL CHECK (current_bid_cents >= 0),
  target_bid_cents INTEGER NOT NULL CHECK (target_bid_cents >= 1),
  charge_cents INTEGER NOT NULL CHECK (charge_cents >= 1),
  currency TEXT NOT NULL,
  product_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('fixture', 'waffo-test', 'waffo-prod')),
  tax_category TEXT NOT NULL,
  claimant_token_hash TEXT,
  metadata_json TEXT NOT NULL,
  metadata_fingerprint TEXT NOT NULL,
  intent_fingerprint TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (
    lifecycle IN ('creating', 'open', 'unknown', 'paid', 'abandoned',
                  'rejected', 'needs_reconciliation')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_intents_provider_checkout_idx
  ON checkout_intents (provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS checkout_intents_week_lifecycle_idx
  ON checkout_intents (week_id, lifecycle, created_at);
CREATE INDEX IF NOT EXISTS checkout_intents_fingerprint_idx
  ON checkout_intents (intent_fingerprint);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY NOT NULL,
  intent_id TEXT NOT NULL,
  listing_id TEXT,
  session_id TEXT NOT NULL,
  provider_checkout_id TEXT,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  provider_event_id TEXT,
  provider_event_type TEXT,
  amount_usd INTEGER NOT NULL CHECK (amount_usd >= 1),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 1),
  currency TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('create', 'raise')),
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('applied', 'replayed', 'rejected', 'needs_reconciliation')
  ),
  error_code TEXT,
  FOREIGN KEY (intent_id) REFERENCES checkout_intents(intent_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_intent_idx ON payments (intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_checkout_idx
  ON payments (provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_idx
  ON payments (provider_order_id)
  WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_idx
  ON payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_listing_idx ON payments (listing_id, created_at);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT,
  provider_delivery_id TEXT,
  provider_event_id TEXT,
  provider_payment_id TEXT,
  provider_order_id TEXT,
  provider_checkout_id TEXT,
  provider_event_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  raw_body_hash TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  outcome TEXT NOT NULL,
  error_code TEXT,
  received_at TEXT NOT NULL,
  payload_json TEXT,
  FOREIGN KEY (intent_id) REFERENCES checkout_intents(intent_id),
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_delivery_idx
  ON payment_events (provider_delivery_id)
  WHERE provider_delivery_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_business_idx
  ON payment_events (provider_event_type, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_payment_idx
  ON payment_events (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_order_idx
  ON payment_events (provider_order_id)
  WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_events_intent_idx ON payment_events (intent_id);
CREATE INDEX IF NOT EXISTS payment_events_checkout_idx
  ON payment_events (provider_checkout_id);

CREATE TABLE IF NOT EXISTS checkout_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL,
  provider_checkout_id TEXT,
  event_type TEXT NOT NULL,
  raw_response_hash TEXT,
  outcome TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  payload_json TEXT,
  FOREIGN KEY (intent_id) REFERENCES checkout_intents(intent_id)
);
CREATE INDEX IF NOT EXISTS checkout_events_intent_idx
  ON checkout_events (intent_id, created_at);

/* Compatibility table for pre-intent callers. New code reads intents. */
CREATE TABLE IF NOT EXISTS unpaid_checkouts (
  session_id TEXT PRIMARY KEY NOT NULL,
  provider_checkout_id TEXT,
  week_id TEXT NOT NULL,
  track TEXT NOT NULL,
  artist TEXT NOT NULL,
  listen_url TEXT NOT NULL,
  bid_usd INTEGER NOT NULL CHECK (bid_usd >= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unpaid_provider_checkout_idx
  ON unpaid_checkouts (provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS clicks (
  listing_id TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);
`;

const PAYMENT_EVENTS_MIGRATION = `
CREATE INDEX IF NOT EXISTS payment_events_intent_idx ON payment_events (intent_id);
CREATE INDEX IF NOT EXISTS payment_events_checkout_idx
  ON payment_events (provider_checkout_id);
`;

const INTENT_LEDGER_MIGRATION = `
CREATE TABLE IF NOT EXISTS checkout_intents (
  intent_id TEXT PRIMARY KEY NOT NULL,
  provider_checkout_id TEXT,
  checkout_url TEXT,
  expires_at TEXT,
  week_id TEXT NOT NULL,
  track TEXT NOT NULL,
  artist TEXT NOT NULL,
  listen_key TEXT NOT NULL,
  listen_url TEXT NOT NULL,
  kind TEXT NOT NULL,
  current_bid_cents INTEGER NOT NULL,
  target_bid_cents INTEGER NOT NULL,
  charge_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  product_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  tax_category TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  metadata_fingerprint TEXT NOT NULL,
  intent_fingerprint TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_intents_provider_checkout_idx
  ON checkout_intents (provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS checkout_intents_week_lifecycle_idx
  ON checkout_intents (week_id, lifecycle, created_at);
CREATE INDEX IF NOT EXISTS checkout_intents_fingerprint_idx
  ON checkout_intents (intent_fingerprint);
CREATE TABLE IF NOT EXISTS checkout_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL,
  provider_checkout_id TEXT,
  event_type TEXT NOT NULL,
  raw_response_hash TEXT,
  outcome TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  payload_json TEXT,
  FOREIGN KEY (intent_id) REFERENCES checkout_intents(intent_id)
);
`;

const MIGRATIONS = [
  { id: "001_durable_store.sql", sql: DURABLE_STORE_MIGRATION },
  { id: "002_payment_events.sql", sql: PAYMENT_EVENTS_MIGRATION },
  { id: "003_intent_ledger.sql", sql: INTENT_LEDGER_MIGRATION },
] as const;

export function defaultDatabasePath(
  env: Record<string, string | undefined> = process.env,
): string {
  return databasePath(env);
}

export function openDatabase(path: string = defaultDatabasePath()): AppDb {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  let db: AppDb | undefined;
  try {
    db = new Database(path);
    db.pragma("busy_timeout = 5000");
    if (path !== ":memory:") db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    return db;
  } catch (error) {
    try {
      db?.close();
    } catch {
      /* Preserve the migration/open error while best-effort closing the handle. */
    }
    throw error;
  }
}

function columns(db: AppDb, table: string): Set<string> {
  return new Set(
    (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
}

function ensureColumn(
  db: AppDb,
  table: string,
  name: string,
  definition: string,
): void {
  if (!columns(db, table).has(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

/** Upgrade the older N2 schema in place when an operator reuses its database. */
function upgradeLegacyLedger(db: AppDb): void {
  if (columns(db, "listings").size > 0) {
    ensureColumn(db, "listings", "claimant_token_hash", "TEXT");
  }
  if (columns(db, "checkout_intents").size > 0) {
    ensureColumn(db, "checkout_intents", "claimant_token_hash", "TEXT");
  }
  if (columns(db, "payments").size > 0) {
    ensureColumn(db, "payments", "intent_id", "TEXT");
    ensureColumn(db, "payments", "provider_order_id", "TEXT");
    ensureColumn(db, "payments", "provider_payment_id", "TEXT");
    ensureColumn(db, "payments", "provider_event_id", "TEXT");
    ensureColumn(db, "payments", "provider_event_type", "TEXT");
    ensureColumn(db, "payments", "amount_cents", "INTEGER");
    ensureColumn(db, "payments", "currency", "TEXT");
    ensureColumn(db, "payments", "outcome", "TEXT");
    ensureColumn(db, "payments", "error_code", "TEXT");
  }
  if (columns(db, "payment_events").size > 0) {
    ensureColumn(db, "payment_events", "intent_id", "TEXT");
    ensureColumn(db, "payment_events", "provider_delivery_id", "TEXT");
    ensureColumn(db, "payment_events", "provider_event_id", "TEXT");
    ensureColumn(db, "payment_events", "provider_payment_id", "TEXT");
    ensureColumn(db, "payment_events", "provider_order_id", "TEXT");
    ensureColumn(db, "payment_events", "provider_event_type", "TEXT");
    ensureColumn(db, "payment_events", "raw_body_hash", "TEXT");
    ensureColumn(db, "payment_events", "event_fingerprint", "TEXT");
    ensureColumn(db, "payment_events", "outcome", "TEXT");
    ensureColumn(db, "payment_events", "error_code", "TEXT");
  }
}

export function migrate(db: AppDb): void {
  /*
   * Schema discovery and ALTER TABLE must share one writer transaction. Without
   * BEGIN IMMEDIATE, two app instances upgrading an old database can both see a
   * missing column and one then fails on the other's ALTER TABLE. The existing
   * busy_timeout on openDatabase lets a second opener wait for this transaction.
   */
  const upgrade = db.transaction((): void => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    const applied = new Set(
      (db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map(
        (row) => row.id,
      ),
    );
    const insert = db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)",
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      db.exec(migration.sql);
      if (migration.id === "003_intent_ledger.sql") upgradeLegacyLedger(db);
      insert.run(migration.id, new Date().toISOString());
    }
    /* A database created by an interrupted old migration may have the marker. */
    db.exec(INTENT_LEDGER_MIGRATION);
    upgradeLegacyLedger(db);
    db.exec(`
      CREATE INDEX IF NOT EXISTS payment_events_intent_idx ON payment_events (intent_id);
      CREATE INDEX IF NOT EXISTS payment_events_checkout_idx ON payment_events (provider_checkout_id);
      CREATE INDEX IF NOT EXISTS listings_claimant_idx ON listings (claimant_token_hash);
      CREATE INDEX IF NOT EXISTS checkout_intents_claimant_idx ON checkout_intents (claimant_token_hash);
    `);
  });
  upgrade.immediate();
}
