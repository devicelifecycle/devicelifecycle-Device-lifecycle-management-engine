-- Ensure competitor price rows are unique per device/storage/competitor/condition
-- and remove historical duplicates before enforcing uniqueness.

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY device_id, storage, competitor_name, condition
      ORDER BY scraped_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM competitor_prices
)
DELETE FROM competitor_prices cp
USING ranked r
WHERE cp.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_prices_unique_key
  ON competitor_prices(device_id, storage, competitor_name, condition);
