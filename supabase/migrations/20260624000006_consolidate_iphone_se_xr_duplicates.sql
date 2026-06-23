-- ============================================================================
-- CONSOLIDATE iPhone SE (2nd generation) and iPhone XR catalog duplicates.
--
-- device_catalog has no unique constraint on (make, model) — only sku is
-- unique, and the CSV auto-add path never sets a sku. Every time a customer
-- upload's model string didn't exactly match an existing row's normalized
-- form, a brand new row was created unconditionally. Result: the iPhone SE
-- (2nd generation) family alone was split across 7 separate device_catalog
-- rows, with pricing data (trained_pricing_baselines, competitor_prices,
-- device_last_manual_prices) scattered across only 2 of them — so orders
-- referencing any of the other 5 found zero pricing rows on lookup.
--
-- This migration redirects all references to one canonical row per device,
-- then deactivates the duplicates (not deleted, to preserve historical FK
-- integrity / audit trail).
-- ============================================================================

-- Canonical targets:
--   iPhone SE (2nd generation) -> b44a57bc-55c5-4b63-8bf7-bb79e7bb001e
--   iPhone XR                  -> 3fb22d8c-515a-4f41-a265-18a160e6467d
--
-- Direct FK references — no uniqueness concerns, safe straight UPDATE.
UPDATE order_items SET device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
  WHERE device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  );
UPDATE imei_records SET device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
  WHERE device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  );

UPDATE order_items SET device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
  WHERE device_id IN (
    'b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12'
  );
UPDATE imei_records SET device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
  WHERE device_id IN (
    'b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12'
  );

-- device_last_manual_prices: PRIMARY KEY (device_id, storage, condition) —
-- drop dupe rows that would collide with an existing canonical row, then
-- redirect the rest.
DELETE FROM device_last_manual_prices dup
WHERE dup.device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  )
  AND EXISTS (
    SELECT 1 FROM device_last_manual_prices canon
    WHERE canon.device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
      AND canon.storage = dup.storage AND canon.condition = dup.condition
  );
UPDATE device_last_manual_prices SET device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
  WHERE device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  );

DELETE FROM device_last_manual_prices dup
WHERE dup.device_id IN ('b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12')
  AND EXISTS (
    SELECT 1 FROM device_last_manual_prices canon
    WHERE canon.device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
      AND canon.storage = dup.storage AND canon.condition = dup.condition
  );
UPDATE device_last_manual_prices SET device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
  WHERE device_id IN ('b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12');

-- trained_pricing_baselines: UNIQUE(device_id, storage, carrier, condition)
DELETE FROM trained_pricing_baselines dup
WHERE dup.device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  )
  AND EXISTS (
    SELECT 1 FROM trained_pricing_baselines canon
    WHERE canon.device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
      AND canon.storage = dup.storage AND canon.carrier = dup.carrier AND canon.condition = dup.condition
  );
UPDATE trained_pricing_baselines SET device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
  WHERE device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  );

DELETE FROM trained_pricing_baselines dup
WHERE dup.device_id IN ('b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12')
  AND EXISTS (
    SELECT 1 FROM trained_pricing_baselines canon
    WHERE canon.device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
      AND canon.storage = dup.storage AND canon.carrier = dup.carrier AND canon.condition = dup.condition
  );
UPDATE trained_pricing_baselines SET device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
  WHERE device_id IN ('b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12');

-- competitor_prices: UNIQUE(device_id, storage, competitor_name, condition)
DELETE FROM competitor_prices dup
WHERE dup.device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  )
  AND EXISTS (
    SELECT 1 FROM competitor_prices canon
    WHERE canon.device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
      AND canon.storage = dup.storage AND canon.competitor_name = dup.competitor_name AND canon.condition = dup.condition
  );
UPDATE competitor_prices SET device_id = 'b44a57bc-55c5-4b63-8bf7-bb79e7bb001e'
  WHERE device_id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01'
  );

DELETE FROM competitor_prices dup
WHERE dup.device_id IN ('b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12')
  AND EXISTS (
    SELECT 1 FROM competitor_prices canon
    WHERE canon.device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
      AND canon.storage = dup.storage AND canon.competitor_name = dup.competitor_name AND canon.condition = dup.condition
  );
UPDATE competitor_prices SET device_id = '3fb22d8c-515a-4f41-a265-18a160e6467d'
  WHERE device_id IN ('b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12');

-- Deactivate the now-empty duplicate rows so they're excluded from future
-- CSV-upload matching (getCatalog() only loads is_active = true).
UPDATE device_catalog SET is_active = false
  WHERE id IN (
    'd0010000-0000-0000-0000-000000000023', 'd879a03f-33a0-4276-a846-bc3e6dcb34d7',
    'c7762683-03d7-48e8-8577-fce4ce9c9bd1', 'becb3a7a-7262-4ace-bc50-e588f747e7f9',
    '93bbc99b-9f69-4699-bf91-8a7dae07ac24', '293e216e-e1a6-456a-9fbe-5375037f8a01',
    'b45000d3-4b31-4a7a-90b3-79cf0e92a213', '0b817fbe-f15f-4702-9384-b089efc58940', 'eaf2334d-9fe6-4810-8ed8-43d7df265d12'
  );
