-- ============================================================================
-- Add condition dimension to competitor prices (Fair/Good/Broken)
-- ============================================================================

ALTER TABLE competitor_prices
ADD COLUMN IF NOT EXISTS condition VARCHAR(20);

UPDATE competitor_prices
SET condition = 'good'
WHERE condition IS NULL;

ALTER TABLE competitor_prices
ALTER COLUMN condition SET DEFAULT 'good';

ALTER TABLE competitor_prices
ADD CONSTRAINT competitor_prices_condition_check
CHECK (condition IN ('good', 'fair', 'broken'));

CREATE INDEX IF NOT EXISTS idx_competitor_prices_condition
  ON competitor_prices(condition);

CREATE INDEX IF NOT EXISTS idx_competitor_prices_lookup_v2
  ON competitor_prices(device_id, storage, competitor_name, condition);
