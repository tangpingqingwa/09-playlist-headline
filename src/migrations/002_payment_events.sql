CREATE INDEX IF NOT EXISTS payment_events_intent_idx ON payment_events (intent_id);
CREATE INDEX IF NOT EXISTS payment_events_checkout_idx ON payment_events (provider_checkout_id);
