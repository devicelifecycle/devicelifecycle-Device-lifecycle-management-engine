-- ============================================================================
-- Traceability for the systemic catalog dedup pass: when a duplicate
-- device_catalog row is deactivated because it's been merged into another
-- (canonical) row, record WHICH row it merged into. Previously
-- is_active=false alone conflated "merged duplicate" with other reasons a
-- device might be deactivated (discontinued, manual cleanup, etc.).
-- ============================================================================

ALTER TABLE device_catalog
  ADD COLUMN IF NOT EXISTS merged_into_device_id UUID REFERENCES device_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_device_catalog_merged_into ON device_catalog(merged_into_device_id) WHERE merged_into_device_id IS NOT NULL;
