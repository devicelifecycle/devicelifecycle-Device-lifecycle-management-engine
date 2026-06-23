-- ============================================================================
-- Per-channel notification opt-in/out, defaulting everyone to fully on
-- (no behavior change until a user explicitly turns something off).
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL
    DEFAULT '{"email": true, "sms": true, "in_app": true}'::jsonb;
