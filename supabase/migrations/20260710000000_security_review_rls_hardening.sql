-- ============================================================================
-- SECURITY REVIEW — RLS HARDENING ROUND 2
-- 2026-07-10
--
-- Findings addressed:
-- 1. users: UPDATE policy allowed any authenticated user to update ALL columns
--    on their own row (role, is_active, secondary_role, organization_id,
--    is_org_admin) via a direct PostgREST call, bypassing the application-layer
--    guards in /api/users/[id]/route.ts entirely.
-- 2. margin_settings / functional_deductions: RLS from 20260703000000 used a
--    NOT IN ('customer', 'vendor') denylist. Any new role added to the system
--    in the future would silently pass it. Converted to an explicit allowlist.
-- ============================================================================

-- ── 1. Split users UPDATE policy into admin-only + restricted self-update ────

-- Drop the existing permissive policy that allowed self-update of all columns.
DROP POLICY IF EXISTS users_update_admin ON users;

-- Admins retain full-column UPDATE access on all rows.
CREATE POLICY users_update_admin ON users FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- Self-updates: authenticated users may update their own row, but privileged
-- columns (role, secondary_role, is_active, organization_id, is_org_admin)
-- must remain unchanged. The WITH CHECK subqueries re-read the current DB
-- value for each column and assert it equals the proposed new value — this is
-- the RLS equivalent of column-level write restriction (Postgres RLS has no
-- native per-column UPDATE policy).
CREATE POLICY users_update_self ON users FOR UPDATE
  USING (auth.uid() = id AND NOT is_admin())
  WITH CHECK (
    auth.uid() = id
    AND role             = (SELECT role             FROM users WHERE id = auth.uid())
    AND (secondary_role    IS NOT DISTINCT FROM (SELECT secondary_role    FROM users WHERE id = auth.uid()))
    AND (is_active         IS NOT DISTINCT FROM (SELECT is_active         FROM users WHERE id = auth.uid()))
    AND (organization_id   IS NOT DISTINCT FROM (SELECT organization_id   FROM users WHERE id = auth.uid()))
    AND (is_org_admin      IS NOT DISTINCT FROM (SELECT is_org_admin      FROM users WHERE id = auth.uid()))
  );

-- ── 2. Replace denylist with allowlist for margin_settings / functional_deductions

-- The policies created in 20260703000000 used NOT IN ('customer', 'vendor').
-- Any future role (e.g. 'auditor') would silently inherit read access to
-- internal pricing margins. Explicit allowlist is safer.

DROP POLICY IF EXISTS margin_settings_internal_read ON margin_settings;
DROP POLICY IF EXISTS functional_deductions_internal_read ON functional_deductions;

CREATE POLICY margin_settings_internal_read ON margin_settings FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid())
       IN ('admin', 'coe_manager', 'coe_tech', 'sales')
  );

CREATE POLICY functional_deductions_internal_read ON functional_deductions FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid())
       IN ('admin', 'coe_manager', 'coe_tech', 'sales')
  );
