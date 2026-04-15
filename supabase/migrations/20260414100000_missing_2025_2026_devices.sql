-- ============================================================================
-- Missing 2025-2026 devices
-- Galaxy Watch8 / Watch8 Classic (Jul 2025), Galaxy S25 Edge (Jan 2026),
-- Pixel Watch 4 (Oct 2025), Pixel 10 Pro Fold (Oct 2025)
-- Idempotent via ON CONFLICT (sku) DO NOTHING
-- ============================================================================

INSERT INTO device_catalog (make, model, variant, category, sku, specifications, is_active)
VALUES

  -- =========================================================================
  -- SAMSUNG Galaxy Watch8 series — released July 2025 at Unpacked
  -- (alongside Galaxy Z Fold7 and Z Flip7)
  -- =========================================================================
  ('Samsung', 'Galaxy Watch8', NULL, 'watch', 'SMS-GW8',
    '{"sizes": ["40mm", "44mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch8 Classic', NULL, 'watch', 'SMS-GW8CLS',
    '{"sizes": ["42mm", "46mm"], "storage_options": ["32GB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy S25 Edge — ultra-slim flagship, Jan 2026 Unpacked
  -- =========================================================================
  ('Samsung', 'Galaxy S25 Edge', NULL, 'phone', 'SMS-S25EDGE',
    '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),

  -- =========================================================================
  -- GOOGLE Pixel Watch 4 — released Oct 2025 alongside Pixel 10 series
  -- =========================================================================
  ('Google', 'Pixel Watch 4', NULL, 'watch', 'GOO-PWATCH4',
    '{"sizes": ["41mm", "45mm"], "storage_options": ["32GB"]}'::jsonb, true),

  -- =========================================================================
  -- GOOGLE Pixel 10 Pro Fold — released Oct 2025 alongside Pixel 10 series
  -- =========================================================================
  ('Google', 'Pixel 10 Pro Fold', NULL, 'phone', 'GOO-PX10PROFOLD',
    '{"storage_options": ["256GB", "512GB"]}'::jsonb, true)

ON CONFLICT (sku) DO NOTHING;
