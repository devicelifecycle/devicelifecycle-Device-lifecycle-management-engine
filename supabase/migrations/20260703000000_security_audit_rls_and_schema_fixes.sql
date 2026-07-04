-- ============================================================================
-- SECURITY AUDIT — RLS TIGHTENING + MISSING SCHEMA COLUMNS
-- 2026-07-03
--
-- Findings addressed:
-- 1. order_splits: USING(true) allowed all authenticated users (incl.
--    customers/vendors) to read and insert order split records.
-- 2. margin_settings / functional_deductions: "Anyone can read" SELECT
--    policies leaked internal pricing margins and deduction rules to
--    customers and vendors.
-- 3. device_catalog: USING(true) permitted anonymous (anon-role) reads;
--    changed to require authenticated session.
-- 4. shipments: expected_quantity / received_quantity columns referenced
--    throughout the codebase (validations, service, receiving UI, API route)
--    but never added to the table DDL.
-- ============================================================================

-- ── 1. order_splits RLS ─────────────────────────────────────────────────────
-- Drop the two permissive policies from 20260303200000_order_splitting.sql.
-- The service_role bypass was already added by 20260415000000_rls_gaps.sql
-- and is intentionally kept.

DROP POLICY IF EXISTS "Authenticated users can view order splits" ON order_splits;
DROP POLICY IF EXISTS "Authenticated users can insert order splits" ON order_splits;

-- Internal roles can read splits (sales read-only; COE/admin can write)
CREATE POLICY order_splits_internal_select ON order_splits FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid())
       IN ('admin', 'coe_manager', 'coe_tech', 'sales')
  );

CREATE POLICY order_splits_internal_insert ON order_splits FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid())
       IN ('admin', 'coe_manager', 'coe_tech')
  );

-- ── 2. margin_settings / functional_deductions RLS ──────────────────────────
-- Replace USING(true) SELECT policies with internal-only equivalents.
-- The existing "Admins can manage …" FOR ALL policies remain and cover
-- admin/coe_manager writes.

DROP POLICY IF EXISTS "Anyone can read margin settings" ON margin_settings;
DROP POLICY IF EXISTS "Anyone can read functional deductions" ON functional_deductions;

CREATE POLICY margin_settings_internal_read ON margin_settings FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid())
       NOT IN ('customer', 'vendor')
  );

CREATE POLICY functional_deductions_internal_read ON functional_deductions FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid())
       NOT IN ('customer', 'vendor')
  );

-- ── 3. device_catalog RLS ───────────────────────────────────────────────────
-- Customers and vendors legitimately need to read device catalog entries
-- (make/model/storage — not pricing).  The only change is removing anon
-- (unauthenticated) read access.

DROP POLICY IF EXISTS device_catalog_select ON device_catalog;

CREATE POLICY device_catalog_select ON device_catalog FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

-- ── 4. shipments: add missing quantity columns ───────────────────────────────
-- Both columns are used as optional integers throughout the receiving workflow.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS expected_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER;
