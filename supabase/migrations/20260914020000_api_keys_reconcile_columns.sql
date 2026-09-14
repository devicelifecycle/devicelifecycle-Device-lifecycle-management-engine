-- ============================================================================
-- API KEYS — reconcile the two conflicting definitions of this table
-- 2026-09-14
--
-- Two migrations each did `CREATE TABLE IF NOT EXISTS api_keys` with different
-- columns:
--   20260801000000_api_keys.sql  -> user_id, scopes   (never ran: its version
--                                   slot was taken by the tenant-isolation RLS
--                                   migration, which shared the timestamp)
--   20260808000000_api_keys.sql  -> created_by        (this is what actually
--                                   created the live table)
--
-- So the live table has created_by but NOT user_id/scopes, while the app has
-- routes written against both shapes:
--   /api/admin/api-keys  inserts created_by  -> worked
--   /api/var/api-keys    selects scopes, inserts user_id -> failed outright
--
-- Verified against the live database before writing this. Additive only —
-- adds the two missing columns so both routes work against one table.
-- ============================================================================

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['read','write'];

-- The unique (tenant_id, key_prefix) pair from the never-applied migration —
-- prefixes are shown in the UI to identify a key, so they must not collide
-- within a tenant.
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_tenant_prefix_key ON api_keys(tenant_id, key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
