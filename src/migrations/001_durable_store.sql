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
  lifecycle TEXT NOT NULL,
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
  outcome TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS payment_events_checkout_idx ON payment_events (provider_checkout_id);

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
CREATE INDEX IF NOT EXISTS checkout_events_intent_idx ON checkout_events (intent_id, created_at);

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
