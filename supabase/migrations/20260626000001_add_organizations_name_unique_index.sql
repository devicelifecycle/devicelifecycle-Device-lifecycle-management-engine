-- ============================================================================
-- PREVENT DUPLICATE ORGANIZATION NAMES
-- ============================================================================
-- organizations.name had no uniqueness constraint at all — two near-identical
-- names (different casing/whitespace) could be created as separate rows,
-- fragmenting order/user history across them. Verified no existing duplicates
-- (by normalized name) before adding this, so the index applies cleanly.
-- Case-insensitive + whitespace-insensitive so "Acme Inc" and "acme inc " are
-- still treated as the same organization.
-- ============================================================================

CREATE UNIQUE INDEX idx_organizations_name_unique ON organizations (lower(trim(name)));
