-- ============================================================================
-- "Galaxy A54" (bare) is a stray duplicate of "Galaxy A54 5G" — Samsung's
-- A54 was only ever released as a 5G device, no real 4G-only SKU exists.
-- Confirmed via evidence audit: the bare row has ZERO references anywhere
-- (0 orders, 0 competitor_prices, 0 trained_pricing_baselines, 0 manual
-- prices) while "Galaxy A54 5G" has real, actively-used data on all four.
--
-- This is a deliberately narrow, one-off fix — NOT a general "strip 5G
-- suffix" rule. An evidence audit of 15 similar "X" vs "X 5G" catalog pairs
-- (Galaxy A13/A14/A32/A52/A53, S10, S20 family, S21/S21+, Pixel 4a, OnePlus
-- 7 Pro) found the OTHER 14 pairs have substantial independent pricing
-- history on BOTH sides — they are genuinely separately-tracked SKUs, not
-- naming duplicates, and must not be merged.
-- ============================================================================

UPDATE device_catalog SET is_active = false, merged_into_device_id = '7cd5139e-3669-439f-a787-d4959eee15f4'
  WHERE id = 'd0020000-0000-0000-0000-000000000017';
