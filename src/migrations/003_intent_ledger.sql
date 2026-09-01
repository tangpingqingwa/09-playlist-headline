/* The application migration is inline in src/db.ts so Next can migrate a new
   production database. This marker documents the durable intent/event ledger
   added after the original N2 schema. */
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
  claimant_token_hash TEXT,
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
