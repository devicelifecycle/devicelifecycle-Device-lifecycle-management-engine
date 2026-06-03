-- Normalize non-standard GoRecell storage values in competitor_prices.
-- Strips "(WiFi)", "(WiFi + Cellular)" and " SSD" suffixes so API queries
-- using standard storage keys (e.g. "64GB", "512GB") resolve correctly.
-- Affected devices: Apple iPad Pro 10.5, Apple iPad 11, several Dell laptops.

-- Step 1: Delete non-standard rows where a standard row already exists for
--         the same (device_id, base_storage, condition, competitor_name).
DELETE FROM competitor_prices ns
USING competitor_prices std
WHERE std.device_id        = ns.device_id
  AND std.condition        = ns.condition
  AND std.competitor_name  = ns.competitor_name
  AND std.storage = regexp_replace(
        regexp_replace(ns.storage, '\s*\(WiFi.*?\)', '', 'gi'),
        '\s+SSD$', '', 'i'
      )
  AND std.storage != ns.storage
  AND ns.competitor_name ILIKE '%gorecell%';

-- Step 2: Update remaining non-standard rows to their standard storage key.
UPDATE competitor_prices
SET storage = trim(regexp_replace(
                regexp_replace(storage, '\s*\(WiFi.*?\)', '', 'gi'),
                '\s+SSD$', '', 'i'
              ))
WHERE competitor_name ILIKE '%gorecell%'
  AND (storage LIKE '%(WiFi%' OR storage ILIKE '%SSD');
