-- ============================================================================
-- VAR DELEGATED ROLE ENUM VALUES (Appendix A)
-- 2026-08-18
--
-- The delegated VAR role hierarchy (Entity Admin -> Regional Manager -> Sales
-- Rep) has existed as a TypeScript type (DelegatedRole in src/types/index.ts)
-- and in application-level role checks since the tenancy work landed, but the
-- Postgres user_role enum itself was never extended to accept these values --
-- inserting a users row with role='var_regional_manager' would fail today.
-- Purely additive: ADD VALUE never touches existing rows, and IF NOT EXISTS
-- makes this safe to re-run (same pattern already used for order_status and
-- device_condition in earlier migrations).
-- ============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'var_entity_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'var_regional_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'var_sales_rep';
