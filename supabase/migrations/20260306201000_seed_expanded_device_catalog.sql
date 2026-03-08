-- ============================================================================
-- Seed expanded device catalog for pricing/scraper coverage
-- Includes phones, tablets, watches, and laptops (idempotent via unique SKU)
-- ============================================================================

INSERT INTO device_catalog (make, model, variant, category, sku, specifications, is_active)
VALUES
  -- =========================
  -- Apple iPhone
  -- =========================
  ('Apple', 'iPhone 11', NULL, 'phone', 'APL-IP11', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone 11 Pro', NULL, 'phone', 'APL-IP11PRO', '{"storage_options": ["64GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 11 Pro Max', NULL, 'phone', 'APL-IP11PROMAX', '{"storage_options": ["64GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 12', NULL, 'phone', 'APL-IP12', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone 12 mini', NULL, 'phone', 'APL-IP12MINI', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone 12 Pro', NULL, 'phone', 'APL-IP12PRO', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 12 Pro Max', NULL, 'phone', 'APL-IP12PROMAX', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 13', NULL, 'phone', 'APL-IP13', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 13 mini', NULL, 'phone', 'APL-IP13MINI', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 13 Pro', NULL, 'phone', 'APL-IP13PRO', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone 13 Pro Max', NULL, 'phone', 'APL-IP13PROMAX', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone 14', NULL, 'phone', 'APL-IP14', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 14 Plus', NULL, 'phone', 'APL-IP14PLUS', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 14 Pro', NULL, 'phone', 'APL-IP14PRO', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone 14 Pro Max', NULL, 'phone', 'APL-IP14PROMAX', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone 15', NULL, 'phone', 'APL-IP15', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 15 Plus', NULL, 'phone', 'APL-IP15PLUS', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 15 Pro', NULL, 'phone', 'APL-IP15PRO', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone 15 Pro Max', NULL, 'phone', 'APL-IP15PROMAX', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone 16', NULL, 'phone', 'APL-IP16', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 16 Plus', NULL, 'phone', 'APL-IP16PLUS', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPhone 16 Pro', NULL, 'phone', 'APL-IP16PRO', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone 16 Pro Max', NULL, 'phone', 'APL-IP16PROMAX', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPhone SE (3rd generation)', NULL, 'phone', 'APL-IPSE3', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),

  -- =========================
  -- Samsung Galaxy S / Z / A
  -- =========================
  ('Samsung', 'Galaxy S21', NULL, 'phone', 'SMS-S21', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S21+', NULL, 'phone', 'SMS-S21PLUS', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S21 Ultra', NULL, 'phone', 'SMS-S21ULTRA', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S22', NULL, 'phone', 'SMS-S22', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S22+', NULL, 'phone', 'SMS-S22PLUS', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S22 Ultra', NULL, 'phone', 'SMS-S22ULTRA', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23', NULL, 'phone', 'SMS-S23', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23+', NULL, 'phone', 'SMS-S23PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23 Ultra', NULL, 'phone', 'SMS-S23ULTRA', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24', NULL, 'phone', 'SMS-S24', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24+', NULL, 'phone', 'SMS-S24PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24 Ultra', NULL, 'phone', 'SMS-S24ULTRA', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Flip5', NULL, 'phone', 'SMS-ZFLIP5', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Flip6', NULL, 'phone', 'SMS-ZFLIP6', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Fold5', NULL, 'phone', 'SMS-ZFOLD5', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Fold6', NULL, 'phone', 'SMS-ZFOLD6', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A54', NULL, 'phone', 'SMS-A54', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A55', NULL, 'phone', 'SMS-A55', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),

  -- =========================
  -- Google Pixel
  -- =========================
  ('Google', 'Pixel 6', NULL, 'phone', 'GOO-PX6', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 6 Pro', NULL, 'phone', 'GOO-PX6PRO', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Google', 'Pixel 7', NULL, 'phone', 'GOO-PX7', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 7 Pro', NULL, 'phone', 'GOO-PX7PRO', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Google', 'Pixel 8', NULL, 'phone', 'GOO-PX8', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 8 Pro', NULL, 'phone', 'GOO-PX8PRO', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Google', 'Pixel 9', NULL, 'phone', 'GOO-PX9', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 9 Pro', NULL, 'phone', 'GOO-PX9PRO', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================
  -- OnePlus / Motorola (key lines)
  -- =========================
  ('OnePlus', 'OnePlus 11', NULL, 'phone', 'OPL-11', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('OnePlus', 'OnePlus 12', NULL, 'phone', 'OPL-12', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Motorola', 'Razr+ (2024)', NULL, 'phone', 'MOT-RAZR24', '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G Power (2024)', NULL, 'phone', 'MOT-GPWR24', '{"storage_options": ["128GB"]}'::jsonb, true),

  -- =========================
  -- Apple iPad
  -- =========================
  ('Apple', 'iPad (10th generation)', NULL, 'tablet', 'APL-IPAD10', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad (9th generation)', NULL, 'tablet', 'APL-IPAD9', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad mini (6th generation)', NULL, 'tablet', 'APL-IPADMINI6', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad Air (5th generation)', NULL, 'tablet', 'APL-IPADAIR5', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad Air (M2)', NULL, 'tablet', 'APL-IPADAIRM2', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 11-inch (M2)', NULL, 'tablet', 'APL-IPADPRO11M2', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 12.9-inch (M2)', NULL, 'tablet', 'APL-IPADPRO129M2', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),

  -- =========================
  -- Samsung Tablets
  -- =========================
  ('Samsung', 'Galaxy Tab S8', NULL, 'tablet', 'SMS-TABS8', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S8+', NULL, 'tablet', 'SMS-TABS8PLUS', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S8 Ultra', NULL, 'tablet', 'SMS-TABS8ULTRA', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9', NULL, 'tablet', 'SMS-TABS9', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9+', NULL, 'tablet', 'SMS-TABS9PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9 Ultra', NULL, 'tablet', 'SMS-TABS9ULTRA', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================
  -- Apple Watch
  -- =========================
  ('Apple', 'Apple Watch SE (2nd generation)', NULL, 'watch', 'APL-AWSE2', '{"sizes": ["40mm", "44mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Series 8', NULL, 'watch', 'APL-AW8', '{"sizes": ["41mm", "45mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Series 9', NULL, 'watch', 'APL-AW9', '{"sizes": ["41mm", "45mm"], "storage_options": ["64GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Series 10', NULL, 'watch', 'APL-AW10', '{"sizes": ["42mm", "46mm"], "storage_options": ["64GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Ultra', NULL, 'watch', 'APL-AWULTRA', '{"sizes": ["49mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Apple', 'Apple Watch Ultra 2', NULL, 'watch', 'APL-AWULTRA2', '{"sizes": ["49mm"], "storage_options": ["64GB"]}'::jsonb, true),

  -- =========================
  -- Samsung / Google Watches
  -- =========================
  ('Samsung', 'Galaxy Watch5', NULL, 'watch', 'SMS-GW5', '{"sizes": ["40mm", "44mm"], "storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch6', NULL, 'watch', 'SMS-GW6', '{"sizes": ["40mm", "44mm"], "storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch6 Classic', NULL, 'watch', 'SMS-GW6CLS', '{"sizes": ["43mm", "47mm"], "storage_options": ["16GB"]}'::jsonb, true),
  ('Google', 'Pixel Watch', NULL, 'watch', 'GOO-PWATCH1', '{"sizes": ["41mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Google', 'Pixel Watch 2', NULL, 'watch', 'GOO-PWATCH2', '{"sizes": ["41mm"], "storage_options": ["32GB"]}'::jsonb, true),

  -- =========================
  -- Apple MacBook
  -- =========================
  ('Apple', 'MacBook Air 13-inch (M1)', NULL, 'laptop', 'APL-MBA13M1', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (M2)', NULL, 'laptop', 'APL-MBA13M2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 15-inch (M2)', NULL, 'laptop', 'APL-MBA15M2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (M3)', NULL, 'laptop', 'APL-MBA13M3', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 15-inch (M3)', NULL, 'laptop', 'APL-MBA15M3', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M1 Pro)', NULL, 'laptop', 'APL-MBP14M1P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M1 Pro)', NULL, 'laptop', 'APL-MBP16M1P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M2 Pro)', NULL, 'laptop', 'APL-MBP14M2P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M2 Pro)', NULL, 'laptop', 'APL-MBP16M2P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M3 Pro)', NULL, 'laptop', 'APL-MBP14M3P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M3 Pro)', NULL, 'laptop', 'APL-MBP16M3P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true)
ON CONFLICT (sku) DO NOTHING;
