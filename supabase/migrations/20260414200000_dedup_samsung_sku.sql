-- ============================================================================
-- Dedup Samsung SAM-* vs SMS-* catalog entries
-- The 20260225 migration used SAM-* SKUs; subsequent migrations use SMS-*.
-- For models that exist under both prefixes, migrate all FK references to the
-- canonical SMS-* row and delete the SAM-* duplicate.
--
-- Pairs (SAM old → SMS canonical):
--   SAM-A35       → SMS-A35      (Galaxy A35)
--   SAM-GW7       → SMS-GW7      (Galaxy Watch 7)
--   SAM-S23FE     → SMS-S23FE    (Galaxy S23 FE)
--   SAM-S24FE     → SMS-S24FE    (Galaxy S24 FE)
--   SAM-TABS9     → SMS-TABS9    (Galaxy Tab S9)
--   SAM-TABS9+    → SMS-TABS9PLUS  (Galaxy Tab S9+)
--   SAM-TABS9U    → SMS-TABS9ULTRA (Galaxy Tab S9 Ultra)
--   SAM-TABA9+    → SMS-TABA9PLUS  (Galaxy Tab A9+)
-- ============================================================================

DO $$
DECLARE
  old_id  uuid;
  new_id  uuid;
  pairs   text[][] := ARRAY[
    ['SAM-A35',    'SMS-A35'],
    ['SAM-GW7',    'SMS-GW7'],
    ['SAM-S23FE',  'SMS-S23FE'],
    ['SAM-S24FE',  'SMS-S24FE'],
    ['SAM-TABS9',  'SMS-TABS9'],
    ['SAM-TABS9+', 'SMS-TABS9PLUS'],
    ['SAM-TABS9U', 'SMS-TABS9ULTRA'],
    ['SAM-TABA9+', 'SMS-TABA9PLUS']
  ];
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    SELECT id INTO old_id FROM device_catalog WHERE sku = pair[1];
    SELECT id INTO new_id FROM device_catalog WHERE sku = pair[2];

    -- Both rows must exist to migrate; skip if either is missing
    IF old_id IS NULL OR new_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Re-point every child table that references device_catalog(id)
    UPDATE order_items       SET device_id = new_id WHERE device_id = old_id;
    UPDATE competitor_prices SET device_id = new_id WHERE device_id = old_id;
    UPDATE pricing_rules     SET device_id = new_id WHERE device_id = old_id;

    -- Delete the stale SAM-* row
    DELETE FROM device_catalog WHERE id = old_id;

    RAISE NOTICE 'Merged % → % (% → %)', pair[1], pair[2], old_id, new_id;
  END LOOP;
END $$;
