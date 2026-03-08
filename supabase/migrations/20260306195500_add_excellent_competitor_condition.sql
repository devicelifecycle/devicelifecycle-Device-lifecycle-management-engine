-- ============================================================================
-- Add excellent to competitor condition enum/check
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'competitor_prices'
      AND constraint_name = 'competitor_prices_condition_check'
  ) THEN
    ALTER TABLE competitor_prices DROP CONSTRAINT competitor_prices_condition_check;
  END IF;

  ALTER TABLE competitor_prices
    ADD CONSTRAINT competitor_prices_condition_check
    CHECK (condition IN ('excellent', 'good', 'fair', 'broken'));
END $$;
