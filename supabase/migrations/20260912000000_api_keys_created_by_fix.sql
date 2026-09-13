-- ============================================================================
-- API KEYS — repair duplicate-migration schema drift
-- 2026-09-12
--
-- Two earlier migrations both did `CREATE TABLE IF NOT EXISTS api_keys` with
-- different columns: 20260801000000_api_keys.sql (user_id, scopes — the one
-- that actually created the live table, since it runs first) and
-- 20260808000000_api_keys.sql (created_by — a no-op against an existing
-- table). POST /api/admin/api-keys inserts `created_by`, which never existed
-- on the live table and fails every call. This adds the missing column
-- without touching either historical migration file. Additive only.
-- ============================================================================

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- The second migration's RLS policies are also dead against the real schema
-- (they reference is_admin()/auth_tenant_id(), which are fine, but were
-- layered onto a table whose CREATE they never actually ran) — re-assert them
-- here so intent matches what's actually live.
DROP POLICY IF EXISTS api_keys_admin_all ON api_keys;
CREATE POLICY api_keys_admin_all ON api_keys FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

DROP POLICY IF EXISTS api_keys_tenant_read ON api_keys;
CREATE POLICY api_keys_tenant_read ON api_keys FOR SELECT
  USING (tenant_id = auth_tenant_id());
