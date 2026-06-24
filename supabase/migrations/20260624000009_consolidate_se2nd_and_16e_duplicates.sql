-- ============================================================================
-- Second consolidation pass: a fresh "iPhone SE 2nd" duplicate slipped past
-- the earlier matching fix (bare "2nd" ordinal with no "Gen"/"Generation"
-- word — a phrasing the normalization didn't anticipate), and the "iPhone
-- 16e" family was never addressed before now (2 literally identical rows
-- plus 2 garbled SKU-style names). Same safe pattern as the prior
-- consolidation: redirect FK references to the canonical (most-data) row,
-- deactivate duplicates, never hard-delete.
--
-- Canonical targets:
--   iPhone SE (2nd generation) -> b44a57bc-55c5-4b63-8bf7-bb79e7bb001e (existing canonical)
--   iPhone 16e                 -> 0137217f-da43-4b43-94fc-eac7b29e0ae6 (most data, cleanest name)
-- ============================================================================

UPDATE order_items SET device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e' WHERE device_id = 'a89cb8b2-1db1-4d49-90d5-fe400a7544a9';
UPDATE imei_records SET device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e' WHERE device_id = 'a89cb8b2-1db1-4d49-90d5-fe400a7544a9';

UPDATE order_items SET device_id = '0137217f-da43-4b43-94fc-eac7b29e0ae6'
  WHERE device_id IN ('40d7812f-243e-4d50-92ec-ed3a7bce397f', 'f3852ead-aa62-46ff-88b6-96e3454be922', 'e80a7731-58be-46ed-addc-f477f0a47443', '2081dd1a-15cb-42bb-8808-9d5ab9f1c2c1');
UPDATE imei_records SET device_id = '0137217f-da43-4b43-94fc-eac7b29e0ae6'
  WHERE device_id IN ('40d7812f-243e-4d50-92ec-ed3a7bce397f', 'f3852ead-aa62-46ff-88b6-96e3454be922', 'e80a7731-58be-46ed-addc-f477f0a47443', '2081dd1a-15cb-42bb-8808-9d5ab9f1c2c1');

-- trained_pricing_baselines: UNIQUE(device_id, storage, carrier, condition)
DELETE FROM trained_pricing_baselines dup
WHERE dup.device_id = '2081dd1a-15cb-42bb-8808-9d5ab9f1c2c1'
  AND EXISTS (SELECT 1 FROM trained_pricing_baselines c WHERE c.device_id = '0137217f-da43-4b43-94fc-eac7b29e0ae6' AND c.storage = dup.storage AND c.carrier = dup.carrier AND c.condition = dup.condition);
UPDATE trained_pricing_baselines SET device_id = '0137217f-da43-4b43-94fc-eac7b29e0ae6' WHERE device_id = '2081dd1a-15cb-42bb-8808-9d5ab9f1c2c1';

-- competitor_prices: UNIQUE(device_id, storage, competitor_name, condition)
DELETE FROM competitor_prices dup
WHERE dup.device_id = '2081dd1a-15cb-42bb-8808-9d5ab9f1c2c1'
  AND EXISTS (SELECT 1 FROM competitor_prices c WHERE c.device_id = '0137217f-da43-4b43-94fc-eac7b29e0ae6' AND c.storage = dup.storage AND c.competitor_name = dup.competitor_name AND c.condition = dup.condition);
UPDATE competitor_prices SET device_id = '0137217f-da43-4b43-94fc-eac7b29e0ae6' WHERE device_id = '2081dd1a-15cb-42bb-8808-9d5ab9f1c2c1';

UPDATE device_catalog SET is_active = false
  WHERE id IN (
    'a89cb8b2-1db1-4d49-90d5-fe400a7544a9',
    '40d7812f-243e-4d50-92ec-ed3a7bce397f', 'f3852ead-aa62-46ff-88b6-96e3454be922',
    'e80a7731-58be-46ed-addc-f477f0a47443', '2081dd1a-15cb-42bb-8808-9d5ab9f1c2c1'
  );
