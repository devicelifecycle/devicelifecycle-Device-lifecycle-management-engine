-- ============================================================================
-- "Galaxy S21" (id 6e00d78b-...) has category=NULL, while its exact
-- duplicate row (id 7cbe7488-..., category='phone') is correctly tagged.
-- This is a missing value, not a conflicting one — Samsung Galaxy S21 is
-- unambiguously a phone. Fixing it so the catalog-wide dedup script's
-- category-family grouping (which intentionally does NOT merge across
-- different categories) can correctly recognize these two rows as the
-- same device on its next run.
-- ============================================================================

UPDATE device_catalog SET category = 'phone'
  WHERE id = '6e00d78b-b072-41ab-963f-7b00796fd1de' AND category IS NULL;
