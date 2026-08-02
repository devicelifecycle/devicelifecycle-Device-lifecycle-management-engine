-- ============================================================================
-- DELEGATED-ROLE SCOPING COLUMNS (Appendix A hierarchy)
-- 2026-08-12
--
-- Supports Regional Manager / Sales Rep data scoping: a customer can be tied to
-- a region and to the rep who owns it; a user can belong to a region. All
-- additive and nullable — inert until delegated VAR users exist.
-- ============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS region VARCHAR(80),
  ADD COLUMN IF NOT EXISTS assigned_rep_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(tenant_id, region);
CREATE INDEX IF NOT EXISTS idx_customers_rep ON customers(assigned_rep_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS region VARCHAR(80);
