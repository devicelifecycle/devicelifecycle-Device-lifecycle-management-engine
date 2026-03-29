-- ============================================================================
-- Complete device catalog: ALL Apple, Samsung, Google devices
-- Adds every missing model not covered by 20260306201000 migration
-- Idempotent via ON CONFLICT (sku) DO NOTHING
-- ============================================================================

INSERT INTO device_catalog (make, model, variant, category, sku, specifications, is_active)
VALUES

  -- =========================================================================
  -- APPLE iPHONE — older models not in original seed
  -- =========================================================================
  ('Apple', 'iPhone 7', NULL, 'phone', 'APL-IP7', '{"storage_options": ["32GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone 7 Plus', NULL, 'phone', 'APL-IP7PLUS', '{"storage_options": ["32GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone 8', NULL, 'phone', 'APL-IP8', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone 8 Plus', NULL, 'phone', 'APL-IP8PLUS', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone X', NULL, 'phone', 'APL-IPX', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone XR', NULL, 'phone', 'APL-IPXR', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone XS', NULL, 'phone', 'APL-IPXS', '{"storage_options": ["64GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone XS Max', NULL, 'phone', 'APL-IPXSMAX', '{"storage_options": ["64GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone SE (1st generation)', NULL, 'phone', 'APL-IPSE1', '{"storage_options": ["16GB", "32GB", "64GB", "128GB"]}'::jsonb, true),
  ('Apple', 'iPhone SE (2nd generation)', NULL, 'phone', 'APL-IPSE2', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  -- iPhone 16e (2025)
  ('Apple', 'iPhone 16e', NULL, 'phone', 'APL-IP16E', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),

  -- =========================================================================
  -- APPLE iPAD — older + newer models
  -- =========================================================================
  ('Apple', 'iPad (7th generation)', NULL, 'tablet', 'APL-IPAD7', '{"storage_options": ["32GB", "128GB"]}'::jsonb, true),
  ('Apple', 'iPad (8th generation)', NULL, 'tablet', 'APL-IPAD8', '{"storage_options": ["32GB", "128GB"]}'::jsonb, true),
  ('Apple', 'iPad mini (5th generation)', NULL, 'tablet', 'APL-IPADMINI5', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad mini (7th generation)', NULL, 'tablet', 'APL-IPADMINI7', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPad Air (3rd generation)', NULL, 'tablet', 'APL-IPADAIR3', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad Air (4th generation)', NULL, 'tablet', 'APL-IPADAIR4', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad Air 11-inch (M3)', NULL, 'tablet', 'APL-IPADAIR11M3', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPad Air 13-inch (M3)', NULL, 'tablet', 'APL-IPADAIR13M3', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 11-inch (3rd generation)', NULL, 'tablet', 'APL-IPADPRO11G3', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 12.9-inch (5th generation)', NULL, 'tablet', 'APL-IPADPRO129G5', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 12.9-inch (6th generation)', NULL, 'tablet', 'APL-IPADPRO129G6', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 11-inch (M4)', NULL, 'tablet', 'APL-IPADPRO11M4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 13-inch (M4)', NULL, 'tablet', 'APL-IPADPRO13M4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),

  -- =========================================================================
  -- APPLE WATCH — older series
  -- =========================================================================
  ('Apple', 'Apple Watch Series 4', NULL, 'watch', 'APL-AW4', '{"sizes": ["40mm", "44mm"], "storage_options": ["16GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Series 5', NULL, 'watch', 'APL-AW5', '{"sizes": ["40mm", "44mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Series 6', NULL, 'watch', 'APL-AW6', '{"sizes": ["40mm", "44mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Series 7', NULL, 'watch', 'APL-AW7', '{"sizes": ["41mm", "45mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch SE (1st generation)', NULL, 'watch', 'APL-AWSE1', '{"sizes": ["40mm", "44mm"], "storage_options": ["32GB"]}'::jsonb, true),

  -- =========================================================================
  -- APPLE MacBook — M3 Max, M4 series, older Intel
  -- =========================================================================
  ('Apple', 'MacBook Pro 14-inch (M3 Max)', NULL, 'laptop', 'APL-MBP14M3MAX', '{"storage_options": ["1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M3 Max)', NULL, 'laptop', 'APL-MBP16M3MAX', '{"storage_options": ["1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M4)', NULL, 'laptop', 'APL-MBP14M4', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M4 Pro)', NULL, 'laptop', 'APL-MBP14M4P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M4 Max)', NULL, 'laptop', 'APL-MBP14M4MAX', '{"storage_options": ["1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M4 Pro)', NULL, 'laptop', 'APL-MBP16M4P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M4 Max)', NULL, 'laptop', 'APL-MBP16M4MAX', '{"storage_options": ["1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (M4)', NULL, 'laptop', 'APL-MBA13M4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 15-inch (M4)', NULL, 'laptop', 'APL-MBA15M4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 13-inch (M1)', NULL, 'laptop', 'APL-MBP13M1', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 13-inch (M2)', NULL, 'laptop', 'APL-MBP13M2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (2020 Intel)', NULL, 'laptop', 'APL-MBA13INTEL20', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),

  -- =========================================================================
  -- APPLE Mac desktop (trade-in relevant)
  -- =========================================================================
  ('Apple', 'Mac Mini (M1)', NULL, 'other', 'APL-MACMINIM1', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'Mac Mini (M2)', NULL, 'other', 'APL-MACMINIM2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'Mac Mini (M2 Pro)', NULL, 'other', 'APL-MACMINIM2P', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'Mac Mini (M4)', NULL, 'other', 'APL-MACMINIM4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'Mac Mini (M4 Pro)', NULL, 'other', 'APL-MACMINIM4P', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iMac 24-inch (M1)', NULL, 'other', 'APL-IMAC24M1', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iMac 24-inch (M3)', NULL, 'other', 'APL-IMAC24M3', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iMac 24-inch (M4)', NULL, 'other', 'APL-IMAC24M4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'Mac Studio (M1 Max)', NULL, 'other', 'APL-STUDIOMAX1', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'Mac Studio (M2 Max)', NULL, 'other', 'APL-STUDIOMAX2', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'Mac Studio (M4 Max)', NULL, 'other', 'APL-STUDIOMAX4', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'Mac Pro (M2 Ultra)', NULL, 'other', 'APL-MACPROM2U', '{"storage_options": ["1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy S — older series
  -- =========================================================================
  ('Samsung', 'Galaxy S20', NULL, 'phone', 'SMS-S20', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S20+', NULL, 'phone', 'SMS-S20PLUS', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S20 Ultra', NULL, 'phone', 'SMS-S20ULTRA', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S20 FE', NULL, 'phone', 'SMS-S20FE', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S21 FE', NULL, 'phone', 'SMS-S21FE', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23 FE', NULL, 'phone', 'SMS-S23FE', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24 FE', NULL, 'phone', 'SMS-S24FE', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S25', NULL, 'phone', 'SMS-S25', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S25+', NULL, 'phone', 'SMS-S25PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S25 Ultra', NULL, 'phone', 'SMS-S25ULTRA', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- Galaxy S26 series (Jan 2026)
  ('Samsung', 'Galaxy S26', NULL, 'phone', 'SMS-S26', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S26+', NULL, 'phone', 'SMS-S26PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S26 Ultra', NULL, 'phone', 'SMS-S26ULTRA', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy Note series
  -- =========================================================================
  ('Samsung', 'Galaxy Note 10', NULL, 'phone', 'SMS-NOTE10', '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Note 10+', NULL, 'phone', 'SMS-NOTE10PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Note 20', NULL, 'phone', 'SMS-NOTE20', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Note 20 Ultra', NULL, 'phone', 'SMS-NOTE20ULTRA', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy Z — older foldables
  -- =========================================================================
  ('Samsung', 'Galaxy Z Flip3', NULL, 'phone', 'SMS-ZFLIP3', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Flip4', NULL, 'phone', 'SMS-ZFLIP4', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Fold3', NULL, 'phone', 'SMS-ZFOLD3', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Fold4', NULL, 'phone', 'SMS-ZFOLD4', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- Galaxy Z 2025 series
  ('Samsung', 'Galaxy Z Flip7', NULL, 'phone', 'SMS-ZFLIP7', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Fold7', NULL, 'phone', 'SMS-ZFOLD7', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy A series (budget/mid-range — high trade-in volume)
  -- =========================================================================
  ('Samsung', 'Galaxy A05', NULL, 'phone', 'SMS-A05', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A14', NULL, 'phone', 'SMS-A14', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A15', NULL, 'phone', 'SMS-A15', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A16', NULL, 'phone', 'SMS-A16', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A25', NULL, 'phone', 'SMS-A25', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A26', NULL, 'phone', 'SMS-A26', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A34', NULL, 'phone', 'SMS-A34', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A35', NULL, 'phone', 'SMS-A35', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A36', NULL, 'phone', 'SMS-A36', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A51', NULL, 'phone', 'SMS-A51', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A52', NULL, 'phone', 'SMS-A52', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A53', NULL, 'phone', 'SMS-A53', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A56', NULL, 'phone', 'SMS-A56', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A71', NULL, 'phone', 'SMS-A71', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A72', NULL, 'phone', 'SMS-A72', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A73', NULL, 'phone', 'SMS-A73', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy Tab — older + newer
  -- =========================================================================
  ('Samsung', 'Galaxy Tab S7', NULL, 'tablet', 'SMS-TABS7', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S7+', NULL, 'tablet', 'SMS-TABS7PLUS', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S7 FE', NULL, 'tablet', 'SMS-TABS7FE', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9 FE', NULL, 'tablet', 'SMS-TABS9FE', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9 FE+', NULL, 'tablet', 'SMS-TABS9FEPLUS', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S10+', NULL, 'tablet', 'SMS-TABS10PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S10 Ultra', NULL, 'tablet', 'SMS-TABS10ULTRA', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab A8', NULL, 'tablet', 'SMS-TABA8', '{"storage_options": ["32GB", "64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab A9', NULL, 'tablet', 'SMS-TABA9', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab A9+', NULL, 'tablet', 'SMS-TABA9PLUS', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy Watch — older + newer
  -- =========================================================================
  ('Samsung', 'Galaxy Watch4', NULL, 'watch', 'SMS-GW4', '{"sizes": ["40mm", "44mm"], "storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch4 Classic', NULL, 'watch', 'SMS-GW4CLS', '{"sizes": ["42mm", "46mm"], "storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch5 Pro', NULL, 'watch', 'SMS-GW5PRO', '{"sizes": ["45mm"], "storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch7', NULL, 'watch', 'SMS-GW7', '{"sizes": ["40mm", "44mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch Ultra', NULL, 'watch', 'SMS-GWULTRA', '{"sizes": ["47mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch FE', NULL, 'watch', 'SMS-GWFE', '{"sizes": ["40mm"], "storage_options": ["16GB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy Buds (trade-in eligible)
  -- =========================================================================
  ('Samsung', 'Galaxy Buds2', NULL, 'other', 'SMS-BUDS2', '{"storage_options": ["N/A"]}'::jsonb, true),
  ('Samsung', 'Galaxy Buds2 Pro', NULL, 'other', 'SMS-BUDS2PRO', '{"storage_options": ["N/A"]}'::jsonb, true),
  ('Samsung', 'Galaxy Buds3', NULL, 'other', 'SMS-BUDS3', '{"storage_options": ["N/A"]}'::jsonb, true),
  ('Samsung', 'Galaxy Buds3 Pro', NULL, 'other', 'SMS-BUDS3PRO', '{"storage_options": ["N/A"]}'::jsonb, true),
  ('Samsung', 'Galaxy Buds FE', NULL, 'other', 'SMS-BUDSFE', '{"storage_options": ["N/A"]}'::jsonb, true),

  -- =========================================================================
  -- GOOGLE Pixel — older models + newer
  -- =========================================================================
  ('Google', 'Pixel 3', NULL, 'phone', 'GOO-PX3', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 3 XL', NULL, 'phone', 'GOO-PX3XL', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 3a', NULL, 'phone', 'GOO-PX3A', '{"storage_options": ["64GB"]}'::jsonb, true),
  ('Google', 'Pixel 3a XL', NULL, 'phone', 'GOO-PX3AXL', '{"storage_options": ["64GB"]}'::jsonb, true),
  ('Google', 'Pixel 4', NULL, 'phone', 'GOO-PX4', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 4 XL', NULL, 'phone', 'GOO-PX4XL', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 4a', NULL, 'phone', 'GOO-PX4A', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 4a 5G', NULL, 'phone', 'GOO-PX4A5G', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 5', NULL, 'phone', 'GOO-PX5', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 5a', NULL, 'phone', 'GOO-PX5A', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 6a', NULL, 'phone', 'GOO-PX6A', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 7a', NULL, 'phone', 'GOO-PX7A', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 8a', NULL, 'phone', 'GOO-PX8A', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 9 Pro XL', NULL, 'phone', 'GOO-PX9PROXL', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Google', 'Pixel 9 Pro Fold', NULL, 'phone', 'GOO-PX9PROFOLD', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Google', 'Pixel 9a', NULL, 'phone', 'GOO-PX9A', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  -- Pixel 10 series (Oct 2025)
  ('Google', 'Pixel 10', NULL, 'phone', 'GOO-PX10', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 10 Pro', NULL, 'phone', 'GOO-PX10PRO', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Google', 'Pixel 10 Pro XL', NULL, 'phone', 'GOO-PX10PROXL', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================================================================
  -- GOOGLE Pixel Tablet
  -- =========================================================================
  ('Google', 'Pixel Tablet', NULL, 'tablet', 'GOO-PTAB', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),

  -- =========================================================================
  -- GOOGLE Pixel Watch — all generations
  -- =========================================================================
  ('Google', 'Pixel Watch 3', NULL, 'watch', 'GOO-PWATCH3', '{"sizes": ["41mm", "45mm"], "storage_options": ["32GB"]}'::jsonb, true),

  -- =========================================================================
  -- GOOGLE Pixel Buds (trade-in eligible)
  -- =========================================================================
  ('Google', 'Pixel Buds Pro', NULL, 'other', 'GOO-BUDSPRO', '{"storage_options": ["N/A"]}'::jsonb, true),
  ('Google', 'Pixel Buds Pro 2', NULL, 'other', 'GOO-BUDSPRO2', '{"storage_options": ["N/A"]}'::jsonb, true)

ON CONFLICT (sku) DO NOTHING;
