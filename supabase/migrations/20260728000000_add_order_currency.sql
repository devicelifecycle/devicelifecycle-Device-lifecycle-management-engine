-- ============================================================================
-- ORDER CURRENCY + FROZEN FX RATE
-- 2026-07-28
--
-- CPO quotes can be issued in USD as well as CAD (scalable to more later).
-- Amounts stay stored in CAD (the base currency); `currency` records the
-- display currency and `fx_rate` is the CAD -> currency multiplier FROZEN at
-- quote time (via the Bank of Canada rate) so a quote's total never drifts when
-- the market moves. CAD orders keep fx_rate = 1.
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(12,6) NOT NULL DEFAULT 1;
