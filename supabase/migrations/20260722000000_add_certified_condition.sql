-- ============================================================================
-- ADD 'certified' TO device_condition ENUM
-- 2026-07-22
--
-- CPO (Certified Pre-Owned) orders were previously stored with the trade-in
-- grade 'good'. CPO devices are certified/refurbished, not used trade-ins, so
-- they now get their own condition, 'certified'. For pricing it behaves like
-- 'excellent' (see CONDITION_CONFIG + the pricing model multiplier maps).
--
-- ALTER TYPE ... ADD VALUE is idempotent via IF NOT EXISTS (Postgres 12+).
-- ============================================================================

ALTER TYPE device_condition ADD VALUE IF NOT EXISTS 'certified';
