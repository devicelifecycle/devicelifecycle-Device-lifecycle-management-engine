-- Deduplicate device_catalog entries that share the same (make, model, variant).
-- Canonical ID = the d00x0000-... seed ID where available; otherwise the older row.
-- All foreign-key references (competitor_prices, order_items, device_prices) are
-- re-pointed to the canonical ID before the duplicate is deleted.

DO $$
DECLARE
  dup RECORD;
  canon_id UUID;
  dup_id UUID;
BEGIN
  -- Find all (make, model, coalesce(variant,'')) groups with more than one row
  FOR dup IN
    SELECT make, model, COALESCE(variant, '') AS variant_key
    FROM device_catalog
    GROUP BY make, model, COALESCE(variant, '')
    HAVING COUNT(*) > 1
  LOOP
    -- Pick the canonical ID: prefer d00x0000 seed IDs (start with 'd0'), else oldest
    SELECT id INTO canon_id
    FROM device_catalog
    WHERE make = dup.make
      AND model = dup.model
      AND COALESCE(variant, '') = dup.variant_key
    ORDER BY
      CASE WHEN id::text LIKE 'd0%' THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1;

    -- Iterate over every OTHER id in this group (the duplicates to remove)
    FOR dup_id IN
      SELECT id
      FROM device_catalog
      WHERE make = dup.make
        AND model = dup.model
        AND COALESCE(variant, '') = dup.variant_key
        AND id <> canon_id
    LOOP
      -- Re-point competitor_prices rows to canonical id
      -- If canonical already has a row with same (storage, competitor_name, condition),
      -- just delete the orphan; otherwise update it.
      DELETE FROM competitor_prices
      WHERE device_id = dup_id
        AND (storage, competitor_name, condition) IN (
          SELECT storage, competitor_name, condition
          FROM competitor_prices
          WHERE device_id = canon_id
        );

      UPDATE competitor_prices
        SET device_id = canon_id
      WHERE device_id = dup_id;

      -- Re-point order_items rows
      UPDATE order_items
        SET device_id = canon_id
      WHERE device_id = dup_id;

      -- Re-point imei_records rows
      UPDATE imei_records
        SET device_id = canon_id
      WHERE device_id = dup_id;

      -- Re-point device_prices rows (table may not exist in all environments)
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_prices' AND table_schema = 'public') THEN
        EXECUTE format(
          'UPDATE device_prices SET device_id = %L WHERE device_id = %L',
          canon_id, dup_id
        );
      END IF;

      -- Now safe to delete the duplicate device
      DELETE FROM device_catalog WHERE id = dup_id;

      RAISE NOTICE 'Merged % % % — dup=% → canon=%', dup.make, dup.model, dup.variant_key, dup_id, canon_id;
    END LOOP;
  END LOOP;
END;
$$;
