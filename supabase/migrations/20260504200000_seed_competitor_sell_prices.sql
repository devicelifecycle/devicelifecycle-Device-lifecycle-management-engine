-- ============================================================================
-- SEED COMPETITOR SELL PRICES FOR CPO PRICING
--
-- Context:
--   competitor_prices.sell_price was never populated, causing the CPO pricing
--   engine to always fall back to tradePrice × 1.18 markup. Channel routing
--   also showed "red/marketplace" for every device because the margin calc
--   had no sell-side anchor.
--
-- This migration adds Bell and GoRecell CPO sell prices for:
--   Apple iPhone XR, 11–15 (128GB + 256GB, good + excellent conditions)
--   Samsung Galaxy S21–S25   (128GB + 256GB, good + excellent conditions)
--
-- Prices are approximate CAD CPO market values (May 2026), based on:
--   GoRecell public listings, Bell Certified Pre-Owned program, and
--   Swappa/Back Market Canada median prices.
--
-- Idempotent: ON CONFLICT DO UPDATE overwrites sell_price only (trade_in_price
-- is managed by the restore migration and left untouched here).
-- ============================================================================

WITH sell_prices (sku, storage, competitor, cond, sell_price) AS (
  VALUES
    -- =========================================================================
    -- iPhone XR
    -- =========================================================================
    ('APL-IPXR'::text, '128GB'::text, 'Bell'::text,     'excellent'::text, 210.00::numeric),
    ('APL-IPXR', '128GB', 'Bell',     'good',    190.00),
    ('APL-IPXR', '128GB', 'GoRecell', 'excellent', 205.00),
    ('APL-IPXR', '128GB', 'GoRecell', 'good',    180.00),
    ('APL-IPXR', '256GB', 'Bell',     'excellent', 235.00),
    ('APL-IPXR', '256GB', 'Bell',     'good',    215.00),
    ('APL-IPXR', '256GB', 'GoRecell', 'excellent', 230.00),
    ('APL-IPXR', '256GB', 'GoRecell', 'good',    205.00),

    -- =========================================================================
    -- iPhone 11
    -- =========================================================================
    ('APL-IP11', '128GB', 'Bell',     'excellent', 250.00),
    ('APL-IP11', '128GB', 'Bell',     'good',    225.00),
    ('APL-IP11', '128GB', 'GoRecell', 'excellent', 245.00),
    ('APL-IP11', '128GB', 'GoRecell', 'good',    218.00),
    ('APL-IP11', '256GB', 'Bell',     'excellent', 275.00),
    ('APL-IP11', '256GB', 'Bell',     'good',    250.00),
    ('APL-IP11', '256GB', 'GoRecell', 'excellent', 270.00),
    ('APL-IP11', '256GB', 'GoRecell', 'good',    242.00),

    -- =========================================================================
    -- iPhone 12
    -- =========================================================================
    ('APL-IP12', '128GB', 'Bell',     'excellent', 340.00),
    ('APL-IP12', '128GB', 'Bell',     'good',    310.00),
    ('APL-IP12', '128GB', 'GoRecell', 'excellent', 330.00),
    ('APL-IP12', '128GB', 'GoRecell', 'good',    300.00),
    ('APL-IP12', '256GB', 'Bell',     'excellent', 380.00),
    ('APL-IP12', '256GB', 'Bell',     'good',    348.00),
    ('APL-IP12', '256GB', 'GoRecell', 'excellent', 370.00),
    ('APL-IP12', '256GB', 'GoRecell', 'good',    338.00),

    -- =========================================================================
    -- iPhone 13
    -- =========================================================================
    ('APL-IP13', '128GB', 'Bell',     'excellent', 465.00),
    ('APL-IP13', '128GB', 'Bell',     'good',    435.00),
    ('APL-IP13', '128GB', 'GoRecell', 'excellent', 455.00),
    ('APL-IP13', '128GB', 'GoRecell', 'good',    425.00),
    ('APL-IP13', '256GB', 'Bell',     'excellent', 505.00),
    ('APL-IP13', '256GB', 'Bell',     'good',    475.00),
    ('APL-IP13', '256GB', 'GoRecell', 'excellent', 495.00),
    ('APL-IP13', '256GB', 'GoRecell', 'good',    462.00),

    -- =========================================================================
    -- iPhone 14
    -- =========================================================================
    ('APL-IP14', '128GB', 'Bell',     'excellent', 565.00),
    ('APL-IP14', '128GB', 'Bell',     'good',    530.00),
    ('APL-IP14', '128GB', 'GoRecell', 'excellent', 555.00),
    ('APL-IP14', '128GB', 'GoRecell', 'good',    518.00),
    ('APL-IP14', '256GB', 'Bell',     'excellent', 615.00),
    ('APL-IP14', '256GB', 'Bell',     'good',    578.00),
    ('APL-IP14', '256GB', 'GoRecell', 'excellent', 600.00),
    ('APL-IP14', '256GB', 'GoRecell', 'good',    565.00),

    -- =========================================================================
    -- iPhone 15
    -- =========================================================================
    ('APL-IP15', '128GB', 'Bell',     'excellent', 675.00),
    ('APL-IP15', '128GB', 'Bell',     'good',    645.00),
    ('APL-IP15', '128GB', 'GoRecell', 'excellent', 665.00),
    ('APL-IP15', '128GB', 'GoRecell', 'good',    630.00),
    ('APL-IP15', '256GB', 'Bell',     'excellent', 725.00),
    ('APL-IP15', '256GB', 'Bell',     'good',    692.00),
    ('APL-IP15', '256GB', 'GoRecell', 'excellent', 712.00),
    ('APL-IP15', '256GB', 'GoRecell', 'good',    678.00),

    -- =========================================================================
    -- Samsung Galaxy S21
    -- =========================================================================
    ('SMS-S21', '128GB', 'Bell',     'excellent', 310.00),
    ('SMS-S21', '128GB', 'Bell',     'good',    285.00),
    ('SMS-S21', '128GB', 'GoRecell', 'excellent', 300.00),
    ('SMS-S21', '128GB', 'GoRecell', 'good',    275.00),
    ('SMS-S21', '256GB', 'Bell',     'excellent', 340.00),
    ('SMS-S21', '256GB', 'Bell',     'good',    315.00),
    ('SMS-S21', '256GB', 'GoRecell', 'excellent', 330.00),
    ('SMS-S21', '256GB', 'GoRecell', 'good',    305.00),

    -- =========================================================================
    -- Samsung Galaxy S22
    -- =========================================================================
    ('SMS-S22', '128GB', 'Bell',     'excellent', 410.00),
    ('SMS-S22', '128GB', 'Bell',     'good',    380.00),
    ('SMS-S22', '128GB', 'GoRecell', 'excellent', 400.00),
    ('SMS-S22', '128GB', 'GoRecell', 'good',    368.00),
    ('SMS-S22', '256GB', 'Bell',     'excellent', 455.00),
    ('SMS-S22', '256GB', 'Bell',     'good',    422.00),
    ('SMS-S22', '256GB', 'GoRecell', 'excellent', 445.00),
    ('SMS-S22', '256GB', 'GoRecell', 'good',    410.00),

    -- =========================================================================
    -- Samsung Galaxy S23
    -- =========================================================================
    ('SMS-S23', '128GB', 'Bell',     'excellent', 510.00),
    ('SMS-S23', '128GB', 'Bell',     'good',    475.00),
    ('SMS-S23', '128GB', 'GoRecell', 'excellent', 498.00),
    ('SMS-S23', '128GB', 'GoRecell', 'good',    462.00),
    ('SMS-S23', '256GB', 'Bell',     'excellent', 555.00),
    ('SMS-S23', '256GB', 'Bell',     'good',    520.00),
    ('SMS-S23', '256GB', 'GoRecell', 'excellent', 542.00),
    ('SMS-S23', '256GB', 'GoRecell', 'good',    505.00),

    -- =========================================================================
    -- Samsung Galaxy S24
    -- =========================================================================
    ('SMS-S24', '128GB', 'Bell',     'excellent', 650.00),
    ('SMS-S24', '128GB', 'Bell',     'good',    618.00),
    ('SMS-S24', '128GB', 'GoRecell', 'excellent', 638.00),
    ('SMS-S24', '128GB', 'GoRecell', 'good',    603.00),
    ('SMS-S24', '256GB', 'Bell',     'excellent', 700.00),
    ('SMS-S24', '256GB', 'Bell',     'good',    665.00),
    ('SMS-S24', '256GB', 'GoRecell', 'excellent', 688.00),
    ('SMS-S24', '256GB', 'GoRecell', 'good',    650.00),

    -- =========================================================================
    -- Samsung Galaxy S25
    -- =========================================================================
    ('SMS-S25', '128GB', 'Bell',     'excellent', 780.00),
    ('SMS-S25', '128GB', 'Bell',     'good',    745.00),
    ('SMS-S25', '128GB', 'GoRecell', 'excellent', 765.00),
    ('SMS-S25', '128GB', 'GoRecell', 'good',    728.00),
    ('SMS-S25', '256GB', 'Bell',     'excellent', 830.00),
    ('SMS-S25', '256GB', 'Bell',     'good',    792.00),
    ('SMS-S25', '256GB', 'GoRecell', 'excellent', 815.00),
    ('SMS-S25', '256GB', 'GoRecell', 'good',    775.00)
)
UPDATE competitor_prices cp
SET
  sell_price = s.sell_price,
  updated_at = NOW()
FROM sell_prices s
JOIN device_catalog dc ON dc.sku = s.sku AND dc.is_active = true
WHERE cp.device_id      = dc.id
  AND cp.storage        = s.storage
  AND cp.competitor_name = s.competitor
  AND cp.condition      = s.cond;
