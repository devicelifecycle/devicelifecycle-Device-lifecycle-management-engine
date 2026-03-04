-- ============================================================================
-- APPLE iPHONE FULL CATALOG - iPhone 11 through iPhone 16
-- All models, storage options, and colors per Apple specifications
-- Aligns with seed IDs (d001...001-014) for overlap; adds missing models
-- ============================================================================

INSERT INTO device_catalog (id, make, model, variant, category, sku, specifications, is_active) VALUES
-- ============================================================================
-- iPhone 11 Series (2019)
-- ============================================================================
('d0010000-0000-0000-0000-000000000019', 'Apple', 'iPhone 11', NULL, 'phone', 'APL-IP11', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Black", "White", "Green", "Yellow", "Purple", "Red"]}', true),
('d0010000-0000-0000-0000-000000000021', 'Apple', 'iPhone 11 Pro', NULL, 'phone', 'APL-IP11P', '{"storage_options": ["64GB", "256GB", "512GB"], "colors": ["Midnight Green", "Space Gray", "Silver", "Gold"]}', true),
('d0010000-0000-0000-0000-000000000022', 'Apple', 'iPhone 11 Pro Max', NULL, 'phone', 'APL-IP11PM', '{"storage_options": ["64GB", "256GB", "512GB"], "colors": ["Midnight Green", "Space Gray", "Silver", "Gold"]}', true),

-- ============================================================================
-- iPhone SE (2nd Gen) (2020)
-- ============================================================================
('d0010000-0000-0000-0000-000000000023', 'Apple', 'iPhone SE (2nd Gen)', NULL, 'phone', 'APL-IPSE2', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Black", "White", "Red"]}', true),

-- ============================================================================
-- iPhone 12 Series (2020)
-- ============================================================================
('d0010000-0000-0000-0000-000000000024', 'Apple', 'iPhone 12 mini', NULL, 'phone', 'APL-IP12M', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Black", "White", "Red", "Blue", "Green", "Purple"]}', true),
('d0010000-0000-0000-0000-000000000013', 'Apple', 'iPhone 12', NULL, 'phone', 'APL-IP12', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Black", "White", "Red", "Blue", "Green", "Purple"]}', true),
('d0010000-0000-0000-0000-000000000012', 'Apple', 'iPhone 12 Pro', NULL, 'phone', 'APL-IP12P', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Pacific Blue", "Graphite", "Silver", "Gold"]}', true),
('d0010000-0000-0000-0000-000000000011', 'Apple', 'iPhone 12 Pro Max', NULL, 'phone', 'APL-IP12PM', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Pacific Blue", "Graphite", "Silver", "Gold"]}', true),

-- ============================================================================
-- iPhone 13 Series (2021)
-- ============================================================================
('d0010000-0000-0000-0000-000000000026', 'Apple', 'iPhone 13 mini', NULL, 'phone', 'APL-IP13M', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Pink", "Blue", "Midnight", "Starlight", "Red", "Green"]}', true),
('d0010000-0000-0000-0000-000000000010', 'Apple', 'iPhone 13', NULL, 'phone', 'APL-IP13', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Pink", "Blue", "Midnight", "Starlight", "Red", "Green"]}', true),
('d0010000-0000-0000-0000-000000000009', 'Apple', 'iPhone 13 Pro', NULL, 'phone', 'APL-IP13P', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Graphite", "Gold", "Silver", "Sierra Blue", "Alpine Green"]}', true),
('d0010000-0000-0000-0000-000000000008', 'Apple', 'iPhone 13 Pro Max', NULL, 'phone', 'APL-IP13PM', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Graphite", "Gold", "Silver", "Sierra Blue", "Alpine Green"]}', true),

-- ============================================================================
-- iPhone SE (3rd Gen) (2022)
-- ============================================================================
('d0010000-0000-0000-0000-000000000014', 'Apple', 'iPhone SE (3rd Gen)', NULL, 'phone', 'APL-IPSE3', '{"storage_options": ["64GB", "128GB", "256GB"], "colors": ["Midnight", "Starlight", "Red"]}', true),

-- ============================================================================
-- iPhone 14 Series (2022)
-- ============================================================================
('d0010000-0000-0000-0000-000000000007', 'Apple', 'iPhone 14', NULL, 'phone', 'APL-IP14', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Midnight", "Purple", "Starlight", "Blue", "Red"]}', true),
('d0010000-0000-0000-0000-000000000027', 'Apple', 'iPhone 14 Plus', NULL, 'phone', 'APL-IP14+', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Midnight", "Purple", "Starlight", "Blue", "Red"]}', true),
('d0010000-0000-0000-0000-000000000006', 'Apple', 'iPhone 14 Pro', NULL, 'phone', 'APL-IP14P', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Space Black", "Silver", "Gold", "Deep Purple"]}', true),
('d0010000-0000-0000-0000-000000000005', 'Apple', 'iPhone 14 Pro Max', NULL, 'phone', 'APL-IP14PM', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Space Black", "Silver", "Gold", "Deep Purple"]}', true),

-- ============================================================================
-- iPhone 15 Series (2023)
-- ============================================================================
('d0010000-0000-0000-0000-000000000004', 'Apple', 'iPhone 15', NULL, 'phone', 'APL-IP15', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "Blue", "Green", "Yellow", "Pink"]}', true),
('d0010000-0000-0000-0000-000000000003', 'Apple', 'iPhone 15 Plus', NULL, 'phone', 'APL-IP15+', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "Blue", "Green", "Yellow", "Pink"]}', true),
('d0010000-0000-0000-0000-000000000002', 'Apple', 'iPhone 15 Pro', NULL, 'phone', 'APL-IP15P', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Natural Titanium", "Blue Titanium", "White Titanium", "Black Titanium"]}', true),
('d0010000-0000-0000-0000-000000000001', 'Apple', 'iPhone 15 Pro Max', NULL, 'phone', 'APL-IP15PM', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Natural Titanium", "Blue Titanium", "White Titanium", "Black Titanium"]}', true),

-- ============================================================================
-- iPhone 16 Series (2024) - reuse expand migration IDs for upsert
-- ============================================================================
('d0010000-0000-0000-0000-000000000018', 'Apple', 'iPhone 16', NULL, 'phone', 'APL-IP16', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "White", "Green", "Pink", "Blue"]}', true),
('d0010000-0000-0000-0000-000000000017', 'Apple', 'iPhone 16 Plus', NULL, 'phone', 'APL-IP16+', '{"storage_options": ["128GB", "256GB", "512GB"], "colors": ["Black", "White", "Green", "Pink", "Blue"]}', true),
('d0010000-0000-0000-0000-000000000016', 'Apple', 'iPhone 16 Pro', NULL, 'phone', 'APL-IP16P', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"], "colors": ["Black Titanium", "White Titanium", "Natural Titanium", "Desert Titanium"]}', true),
('d0010000-0000-0000-0000-000000000015', 'Apple', 'iPhone 16 Pro Max', NULL, 'phone', 'APL-IP16PM', '{"storage_options": ["256GB", "512GB", "1TB"], "colors": ["Black Titanium", "White Titanium", "Natural Titanium", "Desert Titanium"]}', true)

ON CONFLICT (id) DO UPDATE SET
  make = EXCLUDED.make,
  model = EXCLUDED.model,
  variant = EXCLUDED.variant,
  category = EXCLUDED.category,
  sku = EXCLUDED.sku,
  specifications = EXCLUDED.specifications,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
