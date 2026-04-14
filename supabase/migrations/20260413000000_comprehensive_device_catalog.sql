-- ============================================================================
-- COMPREHENSIVE DEVICE CATALOG
-- Adds all major device families not yet covered: Dell, HP, Lenovo, Microsoft
-- Surface, Motorola Edge, OnePlus, missing iPads, Samsung tabs, MacBook variants.
-- Idempotent via ON CONFLICT (sku) DO NOTHING.
-- ============================================================================

INSERT INTO device_catalog (make, model, variant, category, sku, specifications, is_active)
VALUES

  -- =========================================================================
  -- APPLE iPHONE — alternate model name aliases to improve matching
  -- (catalog has "iPhone SE (2nd Gen)" — add the alternate naming used in sheets)
  -- =========================================================================
  ('Apple', 'iPhone SE (2nd generation)', NULL, 'phone', 'APL-IPSE2-ALT', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPhone SE (3rd generation)', NULL, 'phone', 'APL-IPSE3-ALT', '{"storage_options": ["64GB", "128GB", "256GB"]}'::jsonb, true),
  -- iPhone 16e alias
  ('Apple', 'iPhone SE (4th generation)', NULL, 'phone', 'APL-IPSE4', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),

  -- =========================================================================
  -- APPLE iPAD — missing generations
  -- =========================================================================
  ('Apple', 'iPad (5th generation)', NULL, 'tablet', 'APL-IPAD5', '{"storage_options": ["32GB", "128GB"]}'::jsonb, true),
  ('Apple', 'iPad (6th generation)', NULL, 'tablet', 'APL-IPAD6', '{"storage_options": ["32GB", "128GB"]}'::jsonb, true),
  ('Apple', 'iPad (9th generation)', NULL, 'tablet', 'APL-IPAD9', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad (10th generation)', NULL, 'tablet', 'APL-IPAD10', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad (11th generation)', NULL, 'tablet', 'APL-IPAD11', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'iPad mini (6th generation)', NULL, 'tablet', 'APL-IPADMINI6', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad Air (5th generation)', NULL, 'tablet', 'APL-IPADAIR5', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad Air (M1)', NULL, 'tablet', 'APL-IPADAIRM1', '{"storage_options": ["64GB", "256GB"]}'::jsonb, true),
  ('Apple', 'iPad Air (M2)', NULL, 'tablet', 'APL-IPADAIRM2', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 11-inch (1st generation)', NULL, 'tablet', 'APL-IPADPRO11G1', '{"storage_options": ["64GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 11-inch (2nd generation)', NULL, 'tablet', 'APL-IPADPRO11G2', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 12.9-inch (3rd generation)', NULL, 'tablet', 'APL-IPADPRO129G3', '{"storage_options": ["64GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Apple', 'iPad Pro 12.9-inch (4th generation)', NULL, 'tablet', 'APL-IPADPRO129G4', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================================================================
  -- APPLE MacBook — additional Intel-era models common in ITAD sheets
  -- =========================================================================
  ('Apple', 'MacBook Air 13-inch (2019)', NULL, 'laptop', 'APL-MBA13-2019', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (2020)', NULL, 'laptop', 'APL-MBA13-2020', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (M1)', NULL, 'laptop', 'APL-MBA13M1', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (M2)', NULL, 'laptop', 'APL-MBA13M2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 15-inch (M2)', NULL, 'laptop', 'APL-MBA15M2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 15-inch (M3)', NULL, 'laptop', 'APL-MBA15M3', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 13-inch (2019)', NULL, 'laptop', 'APL-MBP13-2019', '{"storage_options": ["128GB", "256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 13-inch (2020)', NULL, 'laptop', 'APL-MBP13-2020', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 13-inch (M2 Pro)', NULL, 'laptop', 'APL-MBP13M2P', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M1 Pro)', NULL, 'laptop', 'APL-MBP14M1P', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M1 Max)', NULL, 'laptop', 'APL-MBP14M1MAX', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M2 Pro)', NULL, 'laptop', 'APL-MBP14M2P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M2 Max)', NULL, 'laptop', 'APL-MBP14M2MAX', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M3)', NULL, 'laptop', 'APL-MBP14M3', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 14-inch (M3 Pro)', NULL, 'laptop', 'APL-MBP14M3P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M1 Pro)', NULL, 'laptop', 'APL-MBP16M1P', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M1 Max)', NULL, 'laptop', 'APL-MBP16M1MAX', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M2 Pro)', NULL, 'laptop', 'APL-MBP16M2P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M2 Max)', NULL, 'laptop', 'APL-MBP16M2MAX', '{"storage_options": ["512GB", "1TB", "2TB", "4TB", "8TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M3 Pro)', NULL, 'laptop', 'APL-MBP16M3P', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Apple', 'MacBook Pro 16-inch (M4)', NULL, 'laptop', 'APL-MBP16M4', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Apple', 'MacBook Air 13-inch (M3)', NULL, 'laptop', 'APL-MBA13M3', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),

  -- =========================================================================
  -- DELL LAPTOPS — Latitude (enterprise), XPS (premium), Inspiron (consumer)
  -- =========================================================================
  -- Latitude (most common in corporate ITAD)
  ('Dell', 'Latitude 5420', NULL, 'laptop', 'DEL-LAT5420', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 5430', NULL, 'laptop', 'DEL-LAT5430', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 5440', NULL, 'laptop', 'DEL-LAT5440', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'Latitude 5520', NULL, 'laptop', 'DEL-LAT5520', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 5530', NULL, 'laptop', 'DEL-LAT5530', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 5540', NULL, 'laptop', 'DEL-LAT5540', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'Latitude 7420', NULL, 'laptop', 'DEL-LAT7420', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 7430', NULL, 'laptop', 'DEL-LAT7430', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 7440', NULL, 'laptop', 'DEL-LAT7440', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'Latitude 7480', NULL, 'laptop', 'DEL-LAT7480', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 7490', NULL, 'laptop', 'DEL-LAT7490', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Latitude 3420', NULL, 'laptop', 'DEL-LAT3420', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Dell', 'Latitude 3430', NULL, 'laptop', 'DEL-LAT3430', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Dell', 'Latitude 3440', NULL, 'laptop', 'DEL-LAT3440', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- XPS
  ('Dell', 'XPS 13 (9310)', NULL, 'laptop', 'DEL-XPS13-9310', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'XPS 13 (9320)', NULL, 'laptop', 'DEL-XPS13-9320', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'XPS 13 (9340)', NULL, 'laptop', 'DEL-XPS13-9340', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'XPS 15 (9500)', NULL, 'laptop', 'DEL-XPS15-9500', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'XPS 15 (9510)', NULL, 'laptop', 'DEL-XPS15-9510', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'XPS 15 (9520)', NULL, 'laptop', 'DEL-XPS15-9520', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'XPS 15 (9530)', NULL, 'laptop', 'DEL-XPS15-9530', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Dell', 'XPS 15 (9560)', NULL, 'laptop', 'DEL-XPS15-9560', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  -- Inspiron
  ('Dell', 'Inspiron 13 (5310)', NULL, 'laptop', 'DEL-INS13-5310', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Dell', 'Inspiron 14 (5420)', NULL, 'laptop', 'DEL-INS14-5420', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Inspiron 15 (3520)', NULL, 'laptop', 'DEL-INS15-3520', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Dell', 'Inspiron 15 (5520)', NULL, 'laptop', 'DEL-INS15-5520', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- Precision (workstation)
  ('Dell', 'Precision 5560', NULL, 'laptop', 'DEL-PREC5560', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'Precision 5570', NULL, 'laptop', 'DEL-PREC5570', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Dell', 'Precision 5580', NULL, 'laptop', 'DEL-PREC5580', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Dell', 'Precision 7560', NULL, 'laptop', 'DEL-PREC7560', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('Dell', 'Precision 7680', NULL, 'laptop', 'DEL-PREC7680', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),

  -- =========================================================================
  -- HP LAPTOPS — EliteBook (enterprise), ProBook (SMB), Spectre/Envy (consumer)
  -- =========================================================================
  -- EliteBook
  ('HP', 'EliteBook 830 G7', NULL, 'laptop', 'HP-EB830G7', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 830 G8', NULL, 'laptop', 'HP-EB830G8', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 830 G9', NULL, 'laptop', 'HP-EB830G9', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 830 G10', NULL, 'laptop', 'HP-EB830G10', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('HP', 'EliteBook 840 G7', NULL, 'laptop', 'HP-EB840G7', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 840 G8', NULL, 'laptop', 'HP-EB840G8', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 840 G9', NULL, 'laptop', 'HP-EB840G9', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 840 G10', NULL, 'laptop', 'HP-EB840G10', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('HP', 'EliteBook 850 G7', NULL, 'laptop', 'HP-EB850G7', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 850 G8', NULL, 'laptop', 'HP-EB850G8', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 860 G9', NULL, 'laptop', 'HP-EB860G9', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook 860 G10', NULL, 'laptop', 'HP-EB860G10', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('HP', 'EliteBook x360 830 G8', NULL, 'laptop', 'HP-EBX360-830G8', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'EliteBook x360 1030 G8', NULL, 'laptop', 'HP-EBX360-1030G8', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- ProBook
  ('HP', 'ProBook 440 G8', NULL, 'laptop', 'HP-PB440G8', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('HP', 'ProBook 440 G9', NULL, 'laptop', 'HP-PB440G9', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'ProBook 440 G10', NULL, 'laptop', 'HP-PB440G10', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'ProBook 450 G8', NULL, 'laptop', 'HP-PB450G8', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'ProBook 450 G9', NULL, 'laptop', 'HP-PB450G9', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'ProBook 450 G10', NULL, 'laptop', 'HP-PB450G10', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'ProBook 640 G8', NULL, 'laptop', 'HP-PB640G8', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('HP', 'ProBook 650 G8', NULL, 'laptop', 'HP-PB650G8', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- Spectre / Envy
  ('HP', 'Spectre x360 13 (2022)', NULL, 'laptop', 'HP-SPEC13-2022', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('HP', 'Spectre x360 14 (2023)', NULL, 'laptop', 'HP-SPEC14-2023', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('HP', 'Spectre x360 16 (2023)', NULL, 'laptop', 'HP-SPEC16-2023', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('HP', 'Envy 13 (2022)', NULL, 'laptop', 'HP-ENV13-2022', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('HP', 'Envy x360 15 (2022)', NULL, 'laptop', 'HP-ENVX360-15-2022', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- ZBook (workstation)
  ('HP', 'ZBook Fury 15 G8', NULL, 'laptop', 'HP-ZBFURY15G8', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('HP', 'ZBook Fury 16 G9', NULL, 'laptop', 'HP-ZBFURY16G9', '{"storage_options": ["512GB", "1TB", "2TB", "4TB"]}'::jsonb, true),
  ('HP', 'ZBook Studio G8', NULL, 'laptop', 'HP-ZBSTUDIO-G8', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),

  -- =========================================================================
  -- LENOVO LAPTOPS — ThinkPad (enterprise), IdeaPad/Yoga (consumer)
  -- =========================================================================
  -- ThinkPad T series (most common in enterprise trade-in)
  ('Lenovo', 'ThinkPad T14 Gen 1', NULL, 'laptop', 'LNV-T14G1', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T14 Gen 2', NULL, 'laptop', 'LNV-T14G2', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T14 Gen 3', NULL, 'laptop', 'LNV-T14G3', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T14 Gen 4', NULL, 'laptop', 'LNV-T14G4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T14s Gen 1', NULL, 'laptop', 'LNV-T14SG1', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T14s Gen 2', NULL, 'laptop', 'LNV-T14SG2', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T14s Gen 3', NULL, 'laptop', 'LNV-T14SG3', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T14s Gen 4', NULL, 'laptop', 'LNV-T14SG4', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T15 Gen 2', NULL, 'laptop', 'LNV-T15G2', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T16 Gen 1', NULL, 'laptop', 'LNV-T16G1', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad T16 Gen 2', NULL, 'laptop', 'LNV-T16G2', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  -- ThinkPad X1 (premium)
  ('Lenovo', 'ThinkPad X1 Carbon Gen 9', NULL, 'laptop', 'LNV-X1CG9', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad X1 Carbon Gen 10', NULL, 'laptop', 'LNV-X1CG10', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad X1 Carbon Gen 11', NULL, 'laptop', 'LNV-X1CG11', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad X1 Carbon Gen 12', NULL, 'laptop', 'LNV-X1CG12', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad X1 Yoga Gen 6', NULL, 'laptop', 'LNV-X1YG6', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad X1 Yoga Gen 7', NULL, 'laptop', 'LNV-X1YG7', '{"storage_options": ["256GB", "512GB", "1TB", "2TB"]}'::jsonb, true),
  -- ThinkPad E series (SMB)
  ('Lenovo', 'ThinkPad E14 Gen 3', NULL, 'laptop', 'LNV-E14G3', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad E14 Gen 4', NULL, 'laptop', 'LNV-E14G4', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad E15 Gen 3', NULL, 'laptop', 'LNV-E15G3', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad E15 Gen 4', NULL, 'laptop', 'LNV-E15G4', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  -- ThinkPad L series
  ('Lenovo', 'ThinkPad L14 Gen 3', NULL, 'laptop', 'LNV-L14G3', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad L14 Gen 4', NULL, 'laptop', 'LNV-L14G4', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkPad L15 Gen 3', NULL, 'laptop', 'LNV-L15G3', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  -- IdeaPad / Yoga (consumer)
  ('Lenovo', 'IdeaPad 5 14 (2022)', NULL, 'laptop', 'LNV-IP514-2022', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'IdeaPad 5 15 (2022)', NULL, 'laptop', 'LNV-IP515-2022', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'Yoga 7 14 (2023)', NULL, 'laptop', 'LNV-YOGA7-14-23', '{"storage_options": ["512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'Yoga 9 14 (2023)', NULL, 'laptop', 'LNV-YOGA9-14-23', '{"storage_options": ["512GB", "1TB", "2TB"]}'::jsonb, true),
  ('Lenovo', 'Yoga Slim 7 (2023)', NULL, 'laptop', 'LNV-YSLIM7-23', '{"storage_options": ["512GB", "1TB"]}'::jsonb, true),
  -- ThinkBook (SMB)
  ('Lenovo', 'ThinkBook 14 Gen 4', NULL, 'laptop', 'LNV-TB14G4', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkBook 14 Gen 5', NULL, 'laptop', 'LNV-TB14G5', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkBook 16 Gen 4', NULL, 'laptop', 'LNV-TB16G4', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Lenovo', 'ThinkBook 16 Gen 5', NULL, 'laptop', 'LNV-TB16G5', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================================================================
  -- MICROSOFT SURFACE — Pro, Laptop, Go, Studio
  -- =========================================================================
  ('Microsoft', 'Surface Pro 7', NULL, 'tablet', 'MSF-PRO7', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Pro 7+', NULL, 'tablet', 'MSF-PRO7PLUS', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Pro 8', NULL, 'tablet', 'MSF-PRO8', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Pro 9', NULL, 'tablet', 'MSF-PRO9', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Pro 10', NULL, 'tablet', 'MSF-PRO10', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Pro 11', NULL, 'tablet', 'MSF-PRO11', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 3 (13.5-inch)', NULL, 'laptop', 'MSF-LAP3-13', '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 3 (15-inch)', NULL, 'laptop', 'MSF-LAP3-15', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 4 (13.5-inch)', NULL, 'laptop', 'MSF-LAP4-13', '{"storage_options": ["512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 4 (15-inch)', NULL, 'laptop', 'MSF-LAP4-15', '{"storage_options": ["512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 5 (13.5-inch)', NULL, 'laptop', 'MSF-LAP5-13', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 5 (15-inch)', NULL, 'laptop', 'MSF-LAP5-15', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 6 (13.5-inch)', NULL, 'laptop', 'MSF-LAP6-13', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Laptop 6 (15-inch)', NULL, 'laptop', 'MSF-LAP6-15', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Go 2', NULL, 'tablet', 'MSF-GO2', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Microsoft', 'Surface Go 3', NULL, 'tablet', 'MSF-GO3', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Microsoft', 'Surface Go 4', NULL, 'tablet', 'MSF-GO4', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Microsoft', 'Surface Studio 2', NULL, 'other', 'MSF-STUDIO2', '{"storage_options": ["1TB", "2TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Studio 2+', NULL, 'other', 'MSF-STUDIO2P', '{"storage_options": ["1TB", "2TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Book 3 (13.5-inch)', NULL, 'laptop', 'MSF-BOOK3-13', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Microsoft', 'Surface Book 3 (15-inch)', NULL, 'laptop', 'MSF-BOOK3-15', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),

  -- =========================================================================
  -- MOTOROLA — Edge series (premium), Moto G series (mid-range)
  -- =========================================================================
  ('Motorola', 'Edge 30', NULL, 'phone', 'MOT-EDGE30', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 30 Pro', NULL, 'phone', 'MOT-EDGE30PRO', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 30 Ultra', NULL, 'phone', 'MOT-EDGE30ULTRA', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 40', NULL, 'phone', 'MOT-EDGE40', '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 40 Pro', NULL, 'phone', 'MOT-EDGE40PRO', '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 40 Neo', NULL, 'phone', 'MOT-EDGE40NEO', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 50', NULL, 'phone', 'MOT-EDGE50', '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 50 Pro', NULL, 'phone', 'MOT-EDGE50PRO', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Motorola', 'Edge 50 Ultra', NULL, 'phone', 'MOT-EDGE50ULTRA', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Motorola', 'Edge 50 Fusion', NULL, 'phone', 'MOT-EDGE50FUSION', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G (2022)', NULL, 'phone', 'MOT-G-2022', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Motorola', 'Moto G 5G (2022)', NULL, 'phone', 'MOT-G5G-2022', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G 5G (2023)', NULL, 'phone', 'MOT-G5G-2023', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G 5G (2024)', NULL, 'phone', 'MOT-G5G-2024', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G Play (2023)', NULL, 'phone', 'MOT-GPLAY-2023', '{"storage_options": ["32GB", "64GB"]}'::jsonb, true),
  ('Motorola', 'Moto G Play (2024)', NULL, 'phone', 'MOT-GPLAY-2024', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Motorola', 'Moto G Stylus (2023)', NULL, 'phone', 'MOT-GSTYLUS-2023', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G Stylus 5G (2024)', NULL, 'phone', 'MOT-GSTYLUS5G-2024', '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Razr (2023)', NULL, 'phone', 'MOT-RAZR-2023', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Razr+ (2023)', NULL, 'phone', 'MOT-RAZRP-2023', '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Razr (2024)', NULL, 'phone', 'MOT-RAZR-2024', '{"storage_options": ["256GB"]}'::jsonb, true),

  -- =========================================================================
  -- ONEPLUS — flagship + Nord
  -- =========================================================================
  ('OnePlus', 'OnePlus 9', NULL, 'phone', 'OPL-9', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('OnePlus', 'OnePlus 9 Pro', NULL, 'phone', 'OPL-9PRO', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('OnePlus', 'OnePlus 10 Pro', NULL, 'phone', 'OPL-10PRO', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('OnePlus', 'OnePlus 10T', NULL, 'phone', 'OPL-10T', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('OnePlus', 'OnePlus 11R', NULL, 'phone', 'OPL-11R', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('OnePlus', 'OnePlus 12R', NULL, 'phone', 'OPL-12R', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('OnePlus', 'OnePlus Open', NULL, 'phone', 'OPL-OPEN', '{"storage_options": ["512GB"]}'::jsonb, true),
  ('OnePlus', 'Nord N30', NULL, 'phone', 'OPL-NORDN30', '{"storage_options": ["128GB"]}'::jsonb, true),
  ('OnePlus', 'Nord CE 3', NULL, 'phone', 'OPL-NORDCE3', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),

  -- =========================================================================
  -- SAMSUNG Galaxy Tab — additional models
  -- =========================================================================
  ('Samsung', 'Galaxy Tab S6', NULL, 'tablet', 'SMS-TABS6', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S6 Lite', NULL, 'tablet', 'SMS-TABS6LITE', '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S8', NULL, 'tablet', 'SMS-TABS8', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S8+', NULL, 'tablet', 'SMS-TABS8PLUS', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S8 Ultra', NULL, 'tablet', 'SMS-TABS8ULTRA', '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9', NULL, 'tablet', 'SMS-TABS9', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9+', NULL, 'tablet', 'SMS-TABS9PLUS', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S9 Ultra', NULL, 'tablet', 'SMS-TABS9ULTRA', '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab S10', NULL, 'tablet', 'SMS-TABS10', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab A7', NULL, 'tablet', 'SMS-TABA7', '{"storage_options": ["32GB", "64GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Tab A7 Lite', NULL, 'tablet', 'SMS-TABA7LITE', '{"storage_options": ["32GB", "64GB"]}'::jsonb, true),

  -- =========================================================================
  -- GOOGLE Pixel Tablet + additional Pixel Watch
  -- =========================================================================
  ('Google', 'Pixel Watch', NULL, 'watch', 'GOO-PWATCH1', '{"sizes": ["41mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Google', 'Pixel Watch 2', NULL, 'watch', 'GOO-PWATCH2', '{"sizes": ["41mm", "45mm"], "storage_options": ["32GB"]}'::jsonb, true),
  ('Google', 'Pixel Fold', NULL, 'phone', 'GOO-PFOLD', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Google', 'Pixel 9 Pro Fold', NULL, 'phone', 'GOO-PX9PROFOLD-ALT', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true)

ON CONFLICT (sku) DO NOTHING;
