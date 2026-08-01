-- ============================================================================
-- CPO CERTIFICATION GRADE (Ryan feedback #3)
-- 2026-08-04
--
-- CPO items get their own certification grade instead of borrowing the trade-in
-- condition scale. Additive nullable column; trade-in rows leave it NULL and
-- pricing is unaffected (CPO price is set by the engine, not the condition).
-- ============================================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cpo_grade VARCHAR(30);
