-- ============================================================================
-- SEED DATA: DEVICE CATALOG & PRICING
-- Run this after migrations to populate initial data

-- ============================================================================
-- DEVICE CATALOG - Popular Devices
-- ============================================================================

INSERT INTO device_catalog (id, make, model, category, specifications, is_active) VALUES
-- Apple iPhones
('d0010000-0000-0000-0000-000000000001', 'Apple', 'iPhone 15 Pro Max', 'phone', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Natural Titanium", "Blue Titanium", "White Titanium", "Black Titanium"]}', true),
('d0010000-0000-0000-0000-000000000002', 'Apple', 'iPhone 15 Pro', 'phone', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Natural Titanium", "Blue Titanium", "White Titanium", "Black Titanium"]}', true),
('d0010000-0000-0000-0000-000000000003', 'Apple', 'iPhone 15 Plus', 'phone', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "Blue", "Green", "Yellow", "Pink"]}', true),
('d0010000-0000-0000-0000-000000000004', 'Apple', 'iPhone 15', 'phone', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "Blue", "Green", "Yellow", "Pink"]}', true),
('d0010000-0000-0000-0000-000000000005', 'Apple', 'iPhone 14 Pro Max', 'phone', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Space Black", "Silver", "Gold", "Deep Purple"]}', true),
('d0010000-0000-0000-0000-000000000006', 'Apple', 'iPhone 14 Pro', 'phone', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Space Black", "Silver", "Gold", "Deep Purple"]}', true),
('d0010000-0000-0000-0000-000000000007', 'Apple', 'iPhone 14', 'phone', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Midnight", "Purple", "Starlight", "Blue", "Red"]}', true),
('d0010000-0000-0000-0000-000000000008', 'Apple', 'iPhone 13 Pro Max', 'phone', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Graphite", "Gold", "Silver", "Sierra Blue", "Alpine Green"]}', true),
('d0010000-0000-0000-0000-000000000009', 'Apple', 'iPhone 13 Pro', 'phone', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Graphite", "Gold", "Silver", "Sierra Blue", "Alpine Green"]}', true),
('d0010000-0000-0000-0000-000000000010', 'Apple', 'iPhone 13', 'phone', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Midnight", "Starlight", "Blue", "Pink", "Red", "Green"]}', true),
('d0010000-0000-0000-0000-000000000011', 'Apple', 'iPhone 12 Pro Max', 'phone', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Graphite", "Gold", "Silver", "Pacific Blue"]}', true),
('d0010000-0000-0000-0000-000000000012', 'Apple', 'iPhone 12 Pro', 'phone', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Graphite", "Gold", "Silver", "Pacific Blue"]}', true),
('d0010000-0000-0000-0000-000000000013', 'Apple', 'iPhone 12', 'phone', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Black", "White", "Blue", "Green", "Red", "Purple"]}', true),
('d0010000-0000-0000-0000-000000000014', 'Apple', 'iPhone SE (3rd Gen)', 'phone', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Midnight", "Starlight", "Red"]}', true),

-- Samsung Galaxy S Series
('d0020000-0000-0000-0000-000000000001', 'Samsung', 'Galaxy S24 Ultra', 'phone', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Titanium Gray", "Titanium Black", "Titanium Violet", "Titanium Yellow"]}', true),
('d0020000-0000-0000-0000-000000000002', 'Samsung', 'Galaxy S24+', 'phone', '{"storage_options": ["256GB", "512GB"], "colors": ["Onyx Black", "Marble Gray", "Cobalt Violet", "Amber Yellow"]}', true),
('d0020000-0000-0000-0000-000000000003', 'Samsung', 'Galaxy S24', 'phone', '{"storage_options": ["128GB", "256GB"], "colors": ["Onyx Black", "Marble Gray", "Cobalt Violet", "Amber Yellow"]}', true),
('d0020000-0000-0000-0000-000000000004', 'Samsung', 'Galaxy S23 Ultra', 'phone', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Phantom Black", "Cream", "Green", "Lavender"]}', true),
('d0020000-0000-0000-0000-000000000005', 'Samsung', 'Galaxy S23+', 'phone', '{"storage_options": ["256GB", "512GB"], "colors": ["Phantom Black", "Cream", "Green", "Lavender"]}', true),
('d0020000-0000-0000-0000-000000000006', 'Samsung', 'Galaxy S23', 'phone', '{"storage_options": ["128GB", "256GB"], "colors": ["Phantom Black", "Cream", "Green", "Lavender"]}', true),
('d0020000-0000-0000-0000-000000000007', 'Samsung', 'Galaxy Z Fold 5', 'phone', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Phantom Black", "Cream", "Icy Blue"]}', true),
('d0020000-0000-0000-0000-000000000008', 'Samsung', 'Galaxy Z Flip 5', 'phone', '{"storage_options": ["256GB", "512GB"], "colors": ["Graphite", "Cream", "Lavender", "Mint"]}', true),

-- Google Pixel
('d0030000-0000-0000-0000-000000000001', 'Google', 'Pixel 8 Pro', 'phone', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Obsidian", "Porcelain", "Bay"]}', true),
('d0030000-0000-0000-0000-000000000002', 'Google', 'Pixel 8', 'phone', '{"storage_options": ["128GB", "256GB"], "colors": ["Obsidian", "Hazel", "Rose"]}', true),
('d0030000-0000-0000-0000-000000000003', 'Google', 'Pixel 7 Pro', 'phone', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Obsidian", "Snow", "Hazel"]}', true),
('d0030000-0000-0000-0000-000000000004', 'Google', 'Pixel 7', 'phone', '{"storage_options": ["128GB", "256GB"], "colors": ["Obsidian", "Snow", "Lemongrass"]}', true),

-- Apple iPads
('d0040000-0000-0000-0000-000000000001', 'Apple', 'iPad Pro 12.9" (M2)', 'tablet', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"], "colors": ["Space Gray", "Silver"]}', true),
('d0040000-0000-0000-0000-000000000002', 'Apple', 'iPad Pro 11" (M2)', 'tablet', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"], "colors": ["Space Gray", "Silver"]}', true),
('d0040000-0000-0000-0000-000000000003', 'Apple', 'iPad Air (5th Gen)', 'tablet', '{"storage_options": ["64GB", "256GB"], "colors": ["Space Gray", "Starlight", "Pink", "Purple", "Blue"]}', true),
('d0040000-0000-0000-0000-000000000004', 'Apple', 'iPad (10th Gen)', 'tablet', '{"storage_options": ["64GB", "256GB"], "colors": ["Silver", "Blue", "Pink", "Yellow"]}', true),
('d0040000-0000-0000-0000-000000000005', 'Apple', 'iPad mini (6th Gen)', 'tablet', '{"storage_options": ["64GB", "256GB"], "colors": ["Space Gray", "Pink", "Purple", "Starlight"]}', true),

-- Apple MacBooks
('d0050000-0000-0000-0000-000000000001', 'Apple', 'MacBook Pro 16" (M3 Max)', 'laptop', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"], "colors": ["Space Black", "Silver"]}', true),
('d0050000-0000-0000-0000-000000000002', 'Apple', 'MacBook Pro 14" (M3 Pro)', 'laptop', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"], "colors": ["Space Black", "Silver"]}', true),
('d0050000-0000-0000-0000-000000000003', 'Apple', 'MacBook Air 15" (M3)', 'laptop', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"], "colors": ["Midnight", "Starlight", "Space Gray", "Silver"]}', true),
('d0050000-0000-0000-0000-000000000004', 'Apple', 'MacBook Air 13" (M3)', 'laptop', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"], "colors": ["Midnight", "Starlight", "Space Gray", "Silver"]}', true),

-- Apple Watch
('d0060000-0000-0000-0000-000000000001', 'Apple', 'Apple Watch Ultra 2', 'watch', '{"storage_options": ["64GB"], "colors": ["Natural Titanium"]}', true),
('d0060000-0000-0000-0000-000000000002', 'Apple', 'Apple Watch Series 9', 'watch', '{"storage_options": ["64GB"], "colors": ["Midnight", "Starlight", "Silver", "Red", "Pink"]}', true),
('d0060000-0000-0000-0000-000000000003', 'Apple', 'Apple Watch SE (2nd Gen)', 'watch', '{"storage_options": ["32GB"], "colors": ["Midnight", "Starlight", "Silver"]}', true)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PRICING TABLES - Base Prices (New Condition)
-- Prices are market estimates - adjust based on your actual sourcing costs
-- ============================================================================

INSERT INTO pricing_tables (device_id, storage, carrier, condition, base_price, buy_price, sell_price, effective_date, is_active) VALUES
-- iPhone 15 Pro Max
('d0010000-0000-0000-0000-000000000001', '256GB', 'Unlocked', 'new', 1199.00, 950.00, 1149.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000001', '512GB', 'Unlocked', 'new', 1399.00, 1100.00, 1349.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000001', '1TB', 'Unlocked', 'new', 1599.00, 1250.00, 1549.00, '2026-01-01', true),

-- iPhone 15 Pro
('d0010000-0000-0000-0000-000000000002', '128GB', 'Unlocked', 'new', 999.00, 780.00, 949.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000002', '256GB', 'Unlocked', 'new', 1099.00, 860.00, 1049.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000002', '512GB', 'Unlocked', 'new', 1299.00, 1020.00, 1249.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000002', '1TB', 'Unlocked', 'new', 1499.00, 1180.00, 1449.00, '2026-01-01', true),

-- iPhone 15 Plus
('d0010000-0000-0000-0000-000000000003', '128GB', 'Unlocked', 'new', 899.00, 700.00, 849.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000003', '256GB', 'Unlocked', 'new', 999.00, 780.00, 949.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000003', '512GB', 'Unlocked', 'new', 1199.00, 940.00, 1149.00, '2026-01-01', true),

-- iPhone 15
('d0010000-0000-0000-0000-000000000004', '128GB', 'Unlocked', 'new', 799.00, 620.00, 749.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000004', '256GB', 'Unlocked', 'new', 899.00, 700.00, 849.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000004', '512GB', 'Unlocked', 'new', 1099.00, 860.00, 1049.00, '2026-01-01', true),

-- iPhone 14 Pro Max
('d0010000-0000-0000-0000-000000000005', '128GB', 'Unlocked', 'new', 899.00, 680.00, 849.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000005', '256GB', 'Unlocked', 'new', 999.00, 760.00, 949.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000005', '512GB', 'Unlocked', 'new', 1199.00, 920.00, 1149.00, '2026-01-01', true),

-- iPhone 14 Pro
('d0010000-0000-0000-0000-000000000006', '128GB', 'Unlocked', 'new', 799.00, 600.00, 749.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000006', '256GB', 'Unlocked', 'new', 899.00, 680.00, 849.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000006', '512GB', 'Unlocked', 'new', 1099.00, 840.00, 1049.00, '2026-01-01', true),

-- iPhone 14
('d0010000-0000-0000-0000-000000000007', '128GB', 'Unlocked', 'new', 699.00, 520.00, 649.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000007', '256GB', 'Unlocked', 'new', 799.00, 600.00, 749.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000007', '512GB', 'Unlocked', 'new', 999.00, 760.00, 949.00, '2026-01-01', true),

-- iPhone 13 Pro Max
('d0010000-0000-0000-0000-000000000008', '128GB', 'Unlocked', 'new', 699.00, 500.00, 649.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000008', '256GB', 'Unlocked', 'new', 799.00, 580.00, 749.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000008', '512GB', 'Unlocked', 'new', 999.00, 740.00, 949.00, '2026-01-01', true),

-- iPhone 13 Pro
('d0010000-0000-0000-0000-000000000009', '128GB', 'Unlocked', 'new', 599.00, 420.00, 549.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000009', '256GB', 'Unlocked', 'new', 699.00, 500.00, 649.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000009', '512GB', 'Unlocked', 'new', 899.00, 660.00, 849.00, '2026-01-01', true),

-- iPhone 13
('d0010000-0000-0000-0000-000000000010', '128GB', 'Unlocked', 'new', 499.00, 340.00, 449.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000010', '256GB', 'Unlocked', 'new', 599.00, 420.00, 549.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000010', '512GB', 'Unlocked', 'new', 799.00, 580.00, 749.00, '2026-01-01', true),

-- iPhone 12 Pro Max
('d0010000-0000-0000-0000-000000000011', '128GB', 'Unlocked', 'new', 549.00, 380.00, 499.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000011', '256GB', 'Unlocked', 'new', 599.00, 420.00, 549.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000011', '512GB', 'Unlocked', 'new', 699.00, 500.00, 649.00, '2026-01-01', true),

-- iPhone 12 Pro
('d0010000-0000-0000-0000-000000000012', '128GB', 'Unlocked', 'new', 449.00, 300.00, 399.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000012', '256GB', 'Unlocked', 'new', 499.00, 340.00, 449.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000012', '512GB', 'Unlocked', 'new', 599.00, 420.00, 549.00, '2026-01-01', true),

-- iPhone 12
('d0010000-0000-0000-0000-000000000013', '64GB', 'Unlocked', 'new', 349.00, 220.00, 299.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000013', '128GB', 'Unlocked', 'new', 399.00, 260.00, 349.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000013', '256GB', 'Unlocked', 'new', 449.00, 300.00, 399.00, '2026-01-01', true),

-- iPhone SE (3rd Gen)
('d0010000-0000-0000-0000-000000000014', '64GB', 'Unlocked', 'new', 299.00, 180.00, 249.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000014', '128GB', 'Unlocked', 'new', 349.00, 220.00, 299.00, '2026-01-01', true),
('d0010000-0000-0000-0000-000000000014', '256GB', 'Unlocked', 'new', 449.00, 300.00, 399.00, '2026-01-01', true),

-- Samsung Galaxy S24 Ultra
('d0020000-0000-0000-0000-000000000001', '256GB', 'Unlocked', 'new', 1299.00, 1000.00, 1249.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000001', '512GB', 'Unlocked', 'new', 1419.00, 1100.00, 1369.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000001', '1TB', 'Unlocked', 'new', 1659.00, 1300.00, 1599.00, '2026-01-01', true),

-- Samsung Galaxy S24+
('d0020000-0000-0000-0000-000000000002', '256GB', 'Unlocked', 'new', 999.00, 760.00, 949.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000002', '512GB', 'Unlocked', 'new', 1119.00, 860.00, 1069.00, '2026-01-01', true),

-- Samsung Galaxy S24
('d0020000-0000-0000-0000-000000000003', '128GB', 'Unlocked', 'new', 799.00, 600.00, 749.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000003', '256GB', 'Unlocked', 'new', 859.00, 660.00, 809.00, '2026-01-01', true),

-- Samsung Galaxy S23 Ultra
('d0020000-0000-0000-0000-000000000004', '256GB', 'Unlocked', 'new', 999.00, 740.00, 949.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000004', '512GB', 'Unlocked', 'new', 1119.00, 840.00, 1069.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000004', '1TB', 'Unlocked', 'new', 1359.00, 1040.00, 1299.00, '2026-01-01', true),

-- Samsung Galaxy Z Fold 5
('d0020000-0000-0000-0000-000000000007', '256GB', 'Unlocked', 'new', 1799.00, 1400.00, 1749.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000007', '512GB', 'Unlocked', 'new', 1919.00, 1500.00, 1869.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000007', '1TB', 'Unlocked', 'new', 2159.00, 1700.00, 2099.00, '2026-01-01', true),

-- Samsung Galaxy Z Flip 5
('d0020000-0000-0000-0000-000000000008', '256GB', 'Unlocked', 'new', 999.00, 760.00, 949.00, '2026-01-01', true),
('d0020000-0000-0000-0000-000000000008', '512GB', 'Unlocked', 'new', 1119.00, 860.00, 1069.00, '2026-01-01', true),

-- Google Pixel 8 Pro
('d0030000-0000-0000-0000-000000000001', '128GB', 'Unlocked', 'new', 999.00, 760.00, 949.00, '2026-01-01', true),
('d0030000-0000-0000-0000-000000000001', '256GB', 'Unlocked', 'new', 1059.00, 820.00, 1009.00, '2026-01-01', true),
('d0030000-0000-0000-0000-000000000001', '512GB', 'Unlocked', 'new', 1179.00, 920.00, 1129.00, '2026-01-01', true),

-- Google Pixel 8
('d0030000-0000-0000-0000-000000000002', '128GB', 'Unlocked', 'new', 699.00, 520.00, 649.00, '2026-01-01', true),
('d0030000-0000-0000-0000-000000000002', '256GB', 'Unlocked', 'new', 759.00, 560.00, 709.00, '2026-01-01', true),

-- Google Pixel 7 Pro
('d0030000-0000-0000-0000-000000000003', '128GB', 'Unlocked', 'new', 599.00, 420.00, 549.00, '2026-01-01', true),
('d0030000-0000-0000-0000-000000000003', '256GB', 'Unlocked', 'new', 699.00, 500.00, 649.00, '2026-01-01', true),
('d0030000-0000-0000-0000-000000000003', '512GB', 'Unlocked', 'new', 799.00, 580.00, 749.00, '2026-01-01', true),

-- Google Pixel 7
('d0030000-0000-0000-0000-000000000004', '128GB', 'Unlocked', 'new', 449.00, 300.00, 399.00, '2026-01-01', true),
('d0030000-0000-0000-0000-000000000004', '256GB', 'Unlocked', 'new', 509.00, 340.00, 459.00, '2026-01-01', true),

-- iPad Pro 12.9" (M2)
('d0040000-0000-0000-0000-000000000001', '128GB', 'WiFi', 'new', 1099.00, 840.00, 1049.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000001', '256GB', 'WiFi', 'new', 1199.00, 920.00, 1149.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000001', '512GB', 'WiFi', 'new', 1399.00, 1080.00, 1349.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000001', '1TB', 'WiFi', 'new', 1799.00, 1400.00, 1749.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000001', '2TB', 'WiFi', 'new', 2199.00, 1720.00, 2149.00, '2026-01-01', true),

-- iPad Pro 11" (M2)
('d0040000-0000-0000-0000-000000000002', '128GB', 'WiFi', 'new', 799.00, 600.00, 749.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000002', '256GB', 'WiFi', 'new', 899.00, 680.00, 849.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000002', '512GB', 'WiFi', 'new', 1099.00, 840.00, 1049.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000002', '1TB', 'WiFi', 'new', 1499.00, 1160.00, 1449.00, '2026-01-01', true),

-- iPad Air (5th Gen)
('d0040000-0000-0000-0000-000000000003', '64GB', 'WiFi', 'new', 599.00, 440.00, 549.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000003', '256GB', 'WiFi', 'new', 749.00, 560.00, 699.00, '2026-01-01', true),

-- iPad (10th Gen)
('d0040000-0000-0000-0000-000000000004', '64GB', 'WiFi', 'new', 449.00, 320.00, 399.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000004', '256GB', 'WiFi', 'new', 599.00, 440.00, 549.00, '2026-01-01', true),

-- iPad mini (6th Gen)
('d0040000-0000-0000-0000-000000000005', '64GB', 'WiFi', 'new', 499.00, 360.00, 449.00, '2026-01-01', true),
('d0040000-0000-0000-0000-000000000005', '256GB', 'WiFi', 'new', 649.00, 480.00, 599.00, '2026-01-01', true),

-- MacBook Pro 16" (M3 Max)
('d0050000-0000-0000-0000-000000000001', '512GB', 'N/A', 'new', 3499.00, 2800.00, 3449.00, '2026-01-01', true),
('d0050000-0000-0000-0000-000000000001', '1TB', 'N/A', 'new', 3699.00, 2960.00, 3649.00, '2026-01-01', true),
('d0050000-0000-0000-0000-000000000001', '2TB', 'N/A', 'new', 4099.00, 3280.00, 4049.00, '2026-01-01', true),

-- MacBook Pro 14" (M3 Pro)
('d0050000-0000-0000-0000-000000000002', '512GB', 'N/A', 'new', 1999.00, 1560.00, 1949.00, '2026-01-01', true),
('d0050000-0000-0000-0000-000000000002', '1TB', 'N/A', 'new', 2199.00, 1720.00, 2149.00, '2026-01-01', true),

-- MacBook Air 15" (M3)
('d0050000-0000-0000-0000-000000000003', '256GB', 'N/A', 'new', 1299.00, 1000.00, 1249.00, '2026-01-01', true),
('d0050000-0000-0000-0000-000000000003', '512GB', 'N/A', 'new', 1499.00, 1160.00, 1449.00, '2026-01-01', true),
('d0050000-0000-0000-0000-000000000003', '1TB', 'N/A', 'new', 1699.00, 1320.00, 1649.00, '2026-01-01', true),

-- MacBook Air 13" (M3)
('d0050000-0000-0000-0000-000000000004', '256GB', 'N/A', 'new', 1099.00, 840.00, 1049.00, '2026-01-01', true),
('d0050000-0000-0000-0000-000000000004', '512GB', 'N/A', 'new', 1299.00, 1000.00, 1249.00, '2026-01-01', true),
('d0050000-0000-0000-0000-000000000004', '1TB', 'N/A', 'new', 1499.00, 1160.00, 1449.00, '2026-01-01', true),

-- Apple Watch Ultra 2
('d0060000-0000-0000-0000-000000000001', '64GB', 'GPS+Cellular', 'new', 799.00, 600.00, 749.00, '2026-01-01', true),

-- Apple Watch Series 9
('d0060000-0000-0000-0000-000000000002', '64GB', 'GPS', 'new', 399.00, 280.00, 349.00, '2026-01-01', true),
('d0060000-0000-0000-0000-000000000002', '64GB', 'GPS+Cellular', 'new', 499.00, 360.00, 449.00, '2026-01-01', true),

-- Apple Watch SE (2nd Gen)
('d0060000-0000-0000-0000-000000000003', '32GB', 'GPS', 'new', 249.00, 160.00, 199.00, '2026-01-01', true),
('d0060000-0000-0000-0000-000000000003', '32GB', 'GPS+Cellular', 'new', 299.00, 200.00, 249.00, '2026-01-01', true)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- MARGIN SETTINGS - Global Pricing Configuration
-- ============================================================================

INSERT INTO margin_settings (setting_key, setting_value, description) VALUES
('trade_in_profit_percent', '20', 'Target profit percentage for trade-in (buy) transactions'),
('trade_in_min_profit', '15', 'Minimum profit amount ($) for any trade-in'),
('cpo_markup_percent', '25', 'Markup percentage for CPO (sell) transactions'),
('cpo_enterprise_markup_percent', '18', 'Discounted markup for enterprise/bulk orders'),
('testing_cost', '5', 'Cost per device for testing/triage'),
('inbound_shipping_cost', '3', 'Average inbound shipping cost per device'),
('outbound_shipping_cost', '5', 'Average outbound shipping cost per device'),
('marketplace_fee_percent', '8', 'Marketplace/platform fee percentage'),
('return_risk_percent', '3', 'Reserve for return risk percentage'),
('processing_cost', '2', 'Processing/handling cost per device')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- ============================================================================
-- FUNCTIONAL DEDUCTIONS - Issue-based price adjustments
-- ============================================================================

INSERT INTO functional_deductions (issue_code, issue_name, deduction_type, deduction_value, applies_to_categories, is_active) VALUES
('SCREEN_CRACK', 'Screen Cracked', 'percentage', 15, ARRAY['phone', 'tablet'], true),
('SCREEN_DEAD', 'Screen Dead/Unresponsive', 'percentage', 40, ARRAY['phone', 'tablet', 'laptop'], true),
('BATTERY_POOR', 'Battery Health <80%', 'fixed', 30, ARRAY['phone', 'tablet', 'laptop', 'watch'], true),
('BATTERY_DEAD', 'Battery Dead/Swelling', 'fixed', 50, ARRAY['phone', 'tablet', 'laptop', 'watch'], true),
('CAMERA_BROKEN', 'Camera Not Working', 'percentage', 20, ARRAY['phone', 'tablet'], true),
('SPEAKER_BROKEN', 'Speaker Not Working', 'fixed', 25, ARRAY['phone', 'tablet', 'laptop'], true),
('MIC_BROKEN', 'Microphone Not Working', 'fixed', 25, ARRAY['phone', 'tablet', 'laptop'], true),
('BUTTON_BROKEN', 'Buttons Not Working', 'fixed', 20, ARRAY['phone', 'tablet', 'watch'], true),
('WATER_DAMAGE', 'Water Damage Indicators', 'percentage', 35, ARRAY['phone', 'tablet', 'laptop', 'watch'], true),
('ICLOUD_LOCKED', 'iCloud/Activation Locked', 'percentage', 90, ARRAY['phone', 'tablet', 'watch'], true),
('CARRIER_LOCKED', 'Carrier Locked', 'fixed', 50, ARRAY['phone'], true),
('MDM_LOCKED', 'MDM/Enterprise Locked', 'percentage', 80, ARRAY['phone', 'tablet', 'laptop'], true),
('TOUCH_ISSUE', 'Touch Screen Issues', 'percentage', 25, ARRAY['phone', 'tablet'], true),
('WIFI_BROKEN', 'WiFi Not Working', 'fixed', 40, ARRAY['phone', 'tablet', 'laptop'], true),
('BLUETOOTH_BROKEN', 'Bluetooth Not Working', 'fixed', 30, ARRAY['phone', 'tablet', 'laptop', 'watch'], true),
('CHARGING_ISSUE', 'Charging Port Damaged', 'fixed', 35, ARRAY['phone', 'tablet', 'laptop'], true),
('KEYBOARD_BROKEN', 'Keyboard Issues', 'fixed', 100, ARRAY['laptop'], true),
('TRACKPAD_BROKEN', 'Trackpad Issues', 'fixed', 80, ARRAY['laptop'], true),
('BACK_CRACK', 'Back Glass Cracked', 'fixed', 40, ARRAY['phone'], true),
('DENTS_SCRATCHES', 'Major Dents/Scratches', 'fixed', 20, ARRAY['phone', 'tablet', 'laptop', 'watch'], true)
ON CONFLICT (issue_code) DO UPDATE SET deduction_value = EXCLUDED.deduction_value;

-- ============================================================================
-- MARKET PRICES - V2 Market-Referenced Pricing Data
-- Based on company spreadsheet: wholesale, marketplace, competitor data (CAD)
-- ============================================================================

INSERT INTO market_prices (device_id, storage, carrier, wholesale_b_minus, wholesale_c_stock, marketplace_price, marketplace_good, marketplace_fair, trade_price, cpo_price, currency, effective_date, is_active) VALUES
-- iPhone 15 Pro Max
('d0010000-0000-0000-0000-000000000001', '256GB', 'Unlocked', 890.00, 820.00, 1050.00, 980.00, 850.00, 750.00, 999.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000001', '512GB', 'Unlocked', 1020.00, 940.00, 1200.00, 1120.00, 980.00, 860.00, 1149.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000001', '1TB', 'Unlocked', 1150.00, 1060.00, 1350.00, 1260.00, 1100.00, 970.00, 1299.00, 'CAD', '2026-02-01', true),

-- iPhone 15 Pro
('d0010000-0000-0000-0000-000000000002', '128GB', 'Unlocked', 720.00, 660.00, 850.00, 790.00, 680.00, 600.00, 799.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000002', '256GB', 'Unlocked', 800.00, 740.00, 950.00, 880.00, 760.00, 670.00, 899.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000002', '512GB', 'Unlocked', 940.00, 870.00, 1100.00, 1020.00, 890.00, 790.00, 1049.00, 'CAD', '2026-02-01', true),

-- iPhone 15
('d0010000-0000-0000-0000-000000000004', '128GB', 'Unlocked', 560.00, 510.00, 670.00, 620.00, 530.00, 460.00, 619.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000004', '256GB', 'Unlocked', 640.00, 590.00, 760.00, 700.00, 610.00, 530.00, 709.00, 'CAD', '2026-02-01', true),

-- iPhone 14 Pro Max
('d0010000-0000-0000-0000-000000000005', '128GB', 'Unlocked', 620.00, 570.00, 740.00, 680.00, 590.00, 510.00, 689.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000005', '256GB', 'Unlocked', 700.00, 640.00, 830.00, 770.00, 660.00, 580.00, 779.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000005', '512GB', 'Unlocked', 840.00, 770.00, 990.00, 920.00, 800.00, 700.00, 939.00, 'CAD', '2026-02-01', true),

-- iPhone 14 Pro
('d0010000-0000-0000-0000-000000000006', '128GB', 'Unlocked', 540.00, 490.00, 640.00, 590.00, 510.00, 440.00, 599.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000006', '256GB', 'Unlocked', 620.00, 570.00, 730.00, 680.00, 590.00, 510.00, 689.00, 'CAD', '2026-02-01', true),

-- iPhone 14
('d0010000-0000-0000-0000-000000000007', '128GB', 'Unlocked', 460.00, 420.00, 550.00, 510.00, 440.00, 370.00, 499.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000007', '256GB', 'Unlocked', 540.00, 500.00, 640.00, 590.00, 510.00, 440.00, 589.00, 'CAD', '2026-02-01', true),

-- iPhone 13 Pro Max
('d0010000-0000-0000-0000-000000000008', '128GB', 'Unlocked', 440.00, 400.00, 530.00, 490.00, 420.00, 350.00, 479.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000008', '256GB', 'Unlocked', 520.00, 480.00, 620.00, 570.00, 490.00, 420.00, 569.00, 'CAD', '2026-02-01', true),

-- iPhone 13 Pro
('d0010000-0000-0000-0000-000000000009', '128GB', 'Unlocked', 370.00, 340.00, 440.00, 410.00, 350.00, 290.00, 399.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000009', '256GB', 'Unlocked', 440.00, 400.00, 520.00, 480.00, 420.00, 350.00, 479.00, 'CAD', '2026-02-01', true),

-- iPhone 13
('d0010000-0000-0000-0000-000000000010', '128GB', 'Unlocked', 300.00, 270.00, 360.00, 330.00, 280.00, 230.00, 319.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000010', '256GB', 'Unlocked', 370.00, 340.00, 440.00, 400.00, 350.00, 290.00, 399.00, 'CAD', '2026-02-01', true),

-- iPhone 12 Pro Max
('d0010000-0000-0000-0000-000000000011', '128GB', 'Unlocked', 330.00, 300.00, 400.00, 370.00, 310.00, 260.00, 349.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000011', '256GB', 'Unlocked', 370.00, 340.00, 440.00, 410.00, 350.00, 290.00, 399.00, 'CAD', '2026-02-01', true),

-- iPhone 12 Pro
('d0010000-0000-0000-0000-000000000012', '128GB', 'Unlocked', 260.00, 240.00, 310.00, 290.00, 250.00, 200.00, 279.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000012', '256GB', 'Unlocked', 300.00, 270.00, 360.00, 330.00, 280.00, 230.00, 319.00, 'CAD', '2026-02-01', true),

-- iPhone 12
('d0010000-0000-0000-0000-000000000013', '64GB', 'Unlocked', 190.00, 170.00, 230.00, 210.00, 180.00, 140.00, 199.00, 'CAD', '2026-02-01', true),
('d0010000-0000-0000-0000-000000000013', '128GB', 'Unlocked', 220.00, 200.00, 270.00, 250.00, 210.00, 170.00, 229.00, 'CAD', '2026-02-01', true),

-- Samsung Galaxy S24 Ultra
('d0020000-0000-0000-0000-000000000001', '256GB', 'Unlocked', 920.00, 850.00, 1100.00, 1020.00, 880.00, 770.00, 1039.00, 'CAD', '2026-02-01', true),
('d0020000-0000-0000-0000-000000000001', '512GB', 'Unlocked', 1020.00, 940.00, 1200.00, 1120.00, 970.00, 850.00, 1149.00, 'CAD', '2026-02-01', true),

-- Samsung Galaxy S24+
('d0020000-0000-0000-0000-000000000002', '256GB', 'Unlocked', 680.00, 620.00, 800.00, 740.00, 640.00, 560.00, 749.00, 'CAD', '2026-02-01', true),

-- Samsung Galaxy S23 Ultra
('d0020000-0000-0000-0000-000000000004', '256GB', 'Unlocked', 670.00, 610.00, 790.00, 730.00, 630.00, 550.00, 739.00, 'CAD', '2026-02-01', true),
('d0020000-0000-0000-0000-000000000004', '512GB', 'Unlocked', 760.00, 700.00, 900.00, 830.00, 720.00, 630.00, 849.00, 'CAD', '2026-02-01', true),

-- Samsung Galaxy Z Fold 5
('d0020000-0000-0000-0000-000000000007', '256GB', 'Unlocked', 1260.00, 1160.00, 1490.00, 1380.00, 1200.00, 1050.00, 1399.00, 'CAD', '2026-02-01', true),

-- Google Pixel 8 Pro
('d0030000-0000-0000-0000-000000000001', '128GB', 'Unlocked', 680.00, 620.00, 800.00, 740.00, 640.00, 560.00, 749.00, 'CAD', '2026-02-01', true),
('d0030000-0000-0000-0000-000000000001', '256GB', 'Unlocked', 740.00, 680.00, 870.00, 810.00, 700.00, 610.00, 819.00, 'CAD', '2026-02-01', true),

-- Google Pixel 8
('d0030000-0000-0000-0000-000000000002', '128GB', 'Unlocked', 460.00, 420.00, 550.00, 510.00, 440.00, 370.00, 499.00, 'CAD', '2026-02-01', true),

-- iPad Pro 12.9" (M2)
('d0040000-0000-0000-0000-000000000001', '256GB', 'WiFi', 830.00, 760.00, 980.00, 910.00, 790.00, 680.00, 919.00, 'CAD', '2026-02-01', true),
('d0040000-0000-0000-0000-000000000001', '512GB', 'WiFi', 980.00, 900.00, 1150.00, 1070.00, 930.00, 810.00, 1089.00, 'CAD', '2026-02-01', true),

-- MacBook Pro 14" (M3 Pro)
('d0050000-0000-0000-0000-000000000002', '512GB', 'N/A', 1400.00, 1290.00, 1650.00, 1540.00, 1330.00, 1160.00, 1559.00, 'CAD', '2026-02-01', true),
('d0050000-0000-0000-0000-000000000002', '1TB', 'N/A', 1540.00, 1420.00, 1820.00, 1690.00, 1470.00, 1280.00, 1719.00, 'CAD', '2026-02-01', true),

-- MacBook Air 13" (M3)
('d0050000-0000-0000-0000-000000000004', '256GB', 'N/A', 750.00, 690.00, 890.00, 830.00, 720.00, 620.00, 839.00, 'CAD', '2026-02-01', true),
('d0050000-0000-0000-0000-000000000004', '512GB', 'N/A', 890.00, 820.00, 1050.00, 980.00, 850.00, 740.00, 999.00, 'CAD', '2026-02-01', true)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMPETITOR PRICES - Telus, Bell trade-in offers (CAD)
-- ============================================================================

INSERT INTO competitor_prices (device_id, storage, competitor_name, trade_in_price, sell_price, source) VALUES
-- iPhone 15 Pro Max - Telus & Bell
('d0010000-0000-0000-0000-000000000001', '256GB', 'Telus', 680.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000001', '256GB', 'Bell', 650.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000001', '512GB', 'Telus', 780.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000001', '512GB', 'Bell', 750.00, NULL, 'manual'),

-- iPhone 15 Pro
('d0010000-0000-0000-0000-000000000002', '128GB', 'Telus', 530.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000002', '128GB', 'Bell', 510.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000002', '256GB', 'Telus', 600.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000002', '256GB', 'Bell', 580.00, NULL, 'manual'),

-- iPhone 15
('d0010000-0000-0000-0000-000000000004', '128GB', 'Telus', 400.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000004', '128GB', 'Bell', 380.00, NULL, 'manual'),

-- iPhone 14 Pro Max
('d0010000-0000-0000-0000-000000000005', '128GB', 'Telus', 450.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000005', '128GB', 'Bell', 430.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000005', '256GB', 'Telus', 510.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000005', '256GB', 'Bell', 490.00, NULL, 'manual'),

-- iPhone 14 Pro
('d0010000-0000-0000-0000-000000000006', '128GB', 'Telus', 380.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000006', '128GB', 'Bell', 360.00, NULL, 'manual'),

-- iPhone 14
('d0010000-0000-0000-0000-000000000007', '128GB', 'Telus', 310.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000007', '128GB', 'Bell', 290.00, NULL, 'manual'),

-- iPhone 13 Pro Max
('d0010000-0000-0000-0000-000000000008', '128GB', 'Telus', 290.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000008', '128GB', 'Bell', 270.00, NULL, 'manual'),

-- iPhone 13
('d0010000-0000-0000-0000-000000000010', '128GB', 'Telus', 190.00, NULL, 'manual'),
('d0010000-0000-0000-0000-000000000010', '128GB', 'Bell', 170.00, NULL, 'manual'),

-- Samsung Galaxy S24 Ultra
('d0020000-0000-0000-0000-000000000001', '256GB', 'Telus', 700.00, NULL, 'manual'),
('d0020000-0000-0000-0000-000000000001', '256GB', 'Bell', 670.00, NULL, 'manual'),

-- Samsung Galaxy S23 Ultra
('d0020000-0000-0000-0000-000000000004', '256GB', 'Telus', 480.00, NULL, 'manual'),
('d0020000-0000-0000-0000-000000000004', '256GB', 'Bell', 460.00, NULL, 'manual'),

-- Google Pixel 8 Pro
('d0030000-0000-0000-0000-000000000001', '128GB', 'Telus', 490.00, NULL, 'manual'),
('d0030000-0000-0000-0000-000000000001', '128GB', 'Bell', 470.00, NULL, 'manual')

ON CONFLICT DO NOTHING;

-- ============================================================================
-- REPAIR COSTS - Value-add refurbishment pricing
-- ============================================================================

INSERT INTO repair_costs (repair_type, device_category, cost, description, is_active) VALUES
-- Buffing / cosmetic repairs
('buffing', 'phone', 15.00, 'Light cosmetic buffing for minor scratches', true),
('buffing', 'tablet', 20.00, 'Cosmetic buffing for tablets', true),
('buffing', 'laptop', 25.00, 'Cosmetic buffing for laptops', true),

-- Glass replacement
('glass_replacement', 'phone', 45.00, 'Front glass/screen protector replacement', true),
('glass_replacement', 'tablet', 65.00, 'Tablet screen glass replacement', true),

-- LCD/Display replacement
('lcd_replacement', 'phone', 85.00, 'Full LCD/OLED display replacement', true),
('lcd_replacement', 'tablet', 120.00, 'Tablet display replacement', true),
('lcd_replacement', 'laptop', 150.00, 'Laptop display replacement', true),

-- Battery replacement
('battery_replacement', 'phone', 35.00, 'Battery replacement for phones', true),
('battery_replacement', 'tablet', 50.00, 'Battery replacement for tablets', true),
('battery_replacement', 'laptop', 80.00, 'Battery replacement for laptops', true),
('battery_replacement', 'watch', 45.00, 'Battery replacement for watches', true),

-- Back glass (iPhone specific)
('back_glass', 'phone', 40.00, 'Back glass replacement', true),

-- Charging port
('charging_port', 'phone', 30.00, 'Charging port repair/replacement', true),
('charging_port', 'tablet', 40.00, 'Charging port repair for tablets', true),

-- Deep clean & refurb
('deep_clean', 'phone', 10.00, 'Full deep clean and sanitize', true),
('deep_clean', 'tablet', 12.00, 'Full deep clean and sanitize', true),
('deep_clean', 'laptop', 15.00, 'Full deep clean, keyboard clean, sanitize', true),

-- Data wipe & setup
('data_wipe', NULL, 5.00, 'Certified data wipe and factory reset', true),

-- Keyboard replacement (laptop)
('keyboard_replacement', 'laptop', 100.00, 'Full keyboard replacement', true),

-- Speaker replacement
('speaker_replacement', 'phone', 25.00, 'Speaker module replacement', true)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- Done! Pricing data seeded successfully (V1 + V2)
-- ============================================================================
