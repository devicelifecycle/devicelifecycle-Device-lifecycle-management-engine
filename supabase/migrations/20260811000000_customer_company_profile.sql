-- ============================================================================
-- CUSTOMER COMPANY PROFILE (End Customer console)
-- 2026-08-11
-- Additive JSONB column for company details (website, industry, hours,
-- locations, departments, contacts). Existing rows default to {}.
-- ============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS company_profile JSONB NOT NULL DEFAULT '{}';
