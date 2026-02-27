-- ============================================================================
-- EXPAND DEVICE CATALOG - Apple, Samsung, Google (full market coverage)
-- Storage, color, model - comprehensive device list
-- Priority: Apple first, then Samsung, then Google
-- ============================================================================

INSERT INTO device_catalog (id, make, model, variant, category, sku, specifications, is_active) VALUES
-- ============================================================================
-- APPLE - iPhones (expanded)
-- ============================================================================
('d0010000-0000-0000-0000-000000000015', 'Apple', 'iPhone 16 Pro Max', NULL, 'phone', 'APL-IP16PM', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Black Titanium", "White Titanium", "Natural Titanium", "Desert Titanium"]}', true),
('d0010000-0000-0000-0000-000000000016', 'Apple', 'iPhone 16 Pro', NULL, 'phone', 'APL-IP16P', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Black Titanium", "White Titanium", "Natural Titanium", "Desert Titanium"]}', true),
('d0010000-0000-0000-0000-000000000017', 'Apple', 'iPhone 16 Plus', NULL, 'phone', 'APL-IP16+', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "White", "Green", "Pink", "Blue"]}', true),
('d0010000-0000-0000-0000-000000000018', 'Apple', 'iPhone 16', NULL, 'phone', 'APL-IP16', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "White", "Green", "Pink", "Blue"]}', true),
('d0010000-0000-0000-0000-000000000019', 'Apple', 'iPhone 11', NULL, 'phone', 'APL-IP11', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Black", "White", "Green", "Yellow", "Purple", "Red"]}', true),
('d0010000-0000-0000-0000-000000000020', 'Apple', 'iPhone XR', NULL, 'phone', 'APL-IPXR', '{"storage_options": ["64GB", "128GB"], "colors": ["Black", "White", "Blue", "Coral", "Yellow", "Red"]}', true),

-- ============================================================================
-- APPLE - iPads (expanded)
-- ============================================================================
('d0040000-0000-0000-0000-000000000006', 'Apple', 'iPad Pro 13" (M4)', NULL, 'tablet', 'APL-IPADP13', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"], "colors": ["Space Black", "Silver"]}', true),
('d0040000-0000-0000-0000-000000000007', 'Apple', 'iPad Pro 11" (M4)', NULL, 'tablet', 'APL-IPADP11', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"], "colors": ["Space Black", "Silver"]}', true),
('d0040000-0000-0000-0000-000000000008', 'Apple', 'iPad Air 13" (M2)', NULL, 'tablet', 'APL-IPADA13', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Space Gray", "Starlight", "Blue", "Purple"]}', true),
('d0040000-0000-0000-0000-000000000009', 'Apple', 'iPad (9th Gen)', NULL, 'tablet', 'APL-IPAD9', '{"storage_options": ["64GB", "256GB"], "colors": ["Space Gray", "Silver"]}', true),

-- ============================================================================
-- APPLE - MacBooks (expanded)
-- ============================================================================
('d0050000-0000-0000-0000-000000000005', 'Apple', 'MacBook Pro 14" (M3)', NULL, 'laptop', 'APL-MBP14M3', '{"storage_options": ["512GB", "1TB", "2TB"], "colors": ["Space Black", "Silver"]}', true),
('d0050000-0000-0000-0000-000000000006', 'Apple', 'MacBook Pro 13" (M2)', NULL, 'laptop', 'APL-MBP13M2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"], "colors": ["Space Gray", "Silver"]}', true),
('d0050000-0000-0000-0000-000000000007', 'Apple', 'iMac 24" (M3)', NULL, 'laptop', 'APL-IMAC24', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Blue", "Green", "Pink", "Silver", "Yellow", "Orange", "Purple"]}', true),

-- ============================================================================
-- APPLE - Apple Watch (expanded)
-- ============================================================================
('d0060000-0000-0000-0000-000000000004', 'Apple', 'Apple Watch Ultra', NULL, 'watch', 'APL-AWU1', '{"storage_options": ["64GB"], "colors": ["Natural Titanium"]}', true),
('d0060000-0000-0000-0000-000000000005', 'Apple', 'Apple Watch Series 8', NULL, 'watch', 'APL-AWS8', '{"storage_options": ["32GB"], "colors": ["Midnight", "Starlight", "Silver", "Red", "Graphite"]}', true),

-- ============================================================================
-- SAMSUNG - Galaxy S & Z (expanded)
-- ============================================================================
('d0020000-0000-0000-0000-000000000009', 'Samsung', 'Galaxy S24 FE', NULL, 'phone', 'SAM-S24FE', '{"storage_options": ["128GB", "256GB"], "colors": ["Graphite", "Cobalt Violet", "Saffron", "Titanium Gray"]}', true),
('d0020000-0000-0000-0000-000000000010', 'Samsung', 'Galaxy S23 FE', NULL, 'phone', 'SAM-S23FE', '{"storage_options": ["128GB", "256GB"], "colors": ["Graphite", "Cream", "Purple", "Mint"]}', true),
('d0020000-0000-0000-0000-000000000011', 'Samsung', 'Galaxy S22 Ultra', NULL, 'phone', 'SAM-S22U', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Phantom Black", "Phantom White", "Green", "Burgundy"]}', true),
('d0020000-0000-0000-0000-000000000012', 'Samsung', 'Galaxy S22+', NULL, 'phone', 'SAM-S22+', '{"storage_options": ["128GB", "256GB"], "colors": ["Phantom Black", "Phantom White", "Green", "Pink Gold", "Burgundy"]}', true),
('d0020000-0000-0000-0000-000000000013', 'Samsung', 'Galaxy S22', NULL, 'phone', 'SAM-S22', '{"storage_options": ["128GB", "256GB"], "colors": ["Phantom Black", "Phantom White", "Green", "Pink Gold", "Burgundy"]}', true),
('d0020000-0000-0000-0000-000000000014', 'Samsung', 'Galaxy Z Fold 6', NULL, 'phone', 'SAM-ZF6', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Silver Shadow", "Pink", "Sapphire Blue"]}', true),
('d0020000-0000-0000-0000-000000000015', 'Samsung', 'Galaxy Z Flip 6', NULL, 'phone', 'SAM-ZFL6', '{"storage_options": ["256GB", "512GB"], "colors": ["Silver Shadow", "Yellow", "Blue", "Mint"]}', true),
('d0020000-0000-0000-0000-000000000016', 'Samsung', 'Galaxy A55', NULL, 'phone', 'SAM-A55', '{"storage_options": ["128GB", "256GB"], "colors": ["Ice Blue", "Lemon", "Lilac", "Navy"]}', true),
('d0020000-0000-0000-0000-000000000017', 'Samsung', 'Galaxy A54', NULL, 'phone', 'SAM-A54', '{"storage_options": ["128GB", "256GB"], "colors": ["Awesome Graphite", "Awesome Violet", "Awesome Lime"]}', true),
('d0020000-0000-0000-0000-000000000018', 'Samsung', 'Galaxy A35', NULL, 'phone', 'SAM-A35', '{"storage_options": ["128GB", "256GB"], "colors": ["Navy", "Ice Blue", "Lemon"]}', true),

-- ============================================================================
-- SAMSUNG - Tablets & Watches
-- ============================================================================
('d0070000-0000-0000-0000-000000000001', 'Samsung', 'Galaxy Tab S9 Ultra', NULL, 'tablet', 'SAM-TABS9U', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Graphite", "Beige"]}', true),
('d0070000-0000-0000-0000-000000000002', 'Samsung', 'Galaxy Tab S9+', NULL, 'tablet', 'SAM-TABS9+', '{"storage_options": ["256GB", "512GB"], "colors": ["Graphite", "Beige"]}', true),
('d0070000-0000-0000-0000-000000000003', 'Samsung', 'Galaxy Tab S9', NULL, 'tablet', 'SAM-TABS9', '{"storage_options": ["128GB", "256GB"], "colors": ["Graphite", "Beige"]}', true),
('d0070000-0000-0000-0000-000000000004', 'Samsung', 'Galaxy Tab A9+', NULL, 'tablet', 'SAM-TABA9+', '{"storage_options": ["64GB", "128GB"], "colors": ["Graphite", "Navy", "Silver"]}', true),
('d0070000-0000-0000-0000-000000000005', 'Samsung', 'Galaxy Watch 7', NULL, 'watch', 'SAM-GW7', '{"storage_options": ["32GB"], "colors": ["Green", "Silver", "Cream"]}', true),
('d0070000-0000-0000-0000-000000000006', 'Samsung', 'Galaxy Watch 6 Classic', NULL, 'watch', 'SAM-GW6C', '{"storage_options": ["32GB"], "colors": ["Black", "Silver"]}', true),
('d0070000-0000-0000-0000-000000000007', 'Samsung', 'Galaxy Watch 6', NULL, 'watch', 'SAM-GW6', '{"storage_options": ["32GB"], "colors": ["Graphite", "Gold", "Silver"]}', true),

-- ============================================================================
-- GOOGLE - Pixel phones (expanded)
-- ============================================================================
('d0030000-0000-0000-0000-000000000005', 'Google', 'Pixel 9 Pro XL', NULL, 'phone', 'GGL-P9PXL', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Obsidian", "Porcelain", "Bay", "Rose"]}', true),
('d0030000-0000-0000-0000-000000000006', 'Google', 'Pixel 9 Pro', NULL, 'phone', 'GGL-P9P', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Obsidian", "Porcelain", "Bay", "Rose"]}', true),
('d0030000-0000-0000-0000-000000000007', 'Google', 'Pixel 9', NULL, 'phone', 'GGL-P9', '{"storage_options": ["128GB", "256GB"], "colors": ["Obsidian", "Hazel", "Rose", "Green"]}', true),
('d0030000-0000-0000-0000-000000000008', 'Google', 'Pixel 7a', NULL, 'phone', 'GGL-P7A', '{"storage_options": ["128GB"], "colors": ["Charcoal", "Snow", "Sea", "Coral"]}', true),
('d0030000-0000-0000-0000-000000000009', 'Google', 'Pixel 6a', NULL, 'phone', 'GGL-P6A', '{"storage_options": ["128GB"], "colors": ["Charcoal", "Chalk", "Sage"]}', true),
('d0030000-0000-0000-0000-000000000010', 'Google', 'Pixel Fold', NULL, 'phone', 'GGL-PF', '{"storage_options": ["256GB", "512GB"], "colors": ["Obsidian", "Porcelain"]}', true),

-- ============================================================================
-- GOOGLE - Tablet & Watch
-- ============================================================================
('d0080000-0000-0000-0000-000000000001', 'Google', 'Pixel Tablet', NULL, 'tablet', 'GGL-PTAB', '{"storage_options": ["128GB", "256GB"], "colors": ["Hazel", "Porcelain", "Rose"]}', true),
('d0080000-0000-0000-0000-000000000002', 'Google', 'Pixel Watch 2', NULL, 'watch', 'GGL-PW2', '{"storage_options": ["32GB"], "colors": ["Polished Silver", "Matte Black", "Champagne Gold", "Hazel"]}', true),
('d0080000-0000-0000-0000-000000000003', 'Google', 'Pixel Watch', NULL, 'watch', 'GGL-PW1', '{"storage_options": ["32GB"], "colors": ["Matte Black", "Polished Silver", "Champagne Gold"]}', true)

ON CONFLICT (id) DO UPDATE SET
  make = EXCLUDED.make,
  model = EXCLUDED.model,
  variant = EXCLUDED.variant,
  category = EXCLUDED.category,
  sku = COALESCE(EXCLUDED.sku, device_catalog.sku),
  specifications = COALESCE(EXCLUDED.specifications, device_catalog.specifications),
  updated_at = NOW();
