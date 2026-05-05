-- ============================================================================
-- ENSURE SAMSUNG, GOOGLE, MOTOROLA PHONES EXIST IN CATALOG
-- Idempotent: ON CONFLICT (sku) DO NOTHING means safe to re-run.
-- Covers the most common trade-in and CPO models for Canadian carriers.
-- ============================================================================

INSERT INTO device_catalog (make, model, variant, category, sku, specifications, is_active)
VALUES

  -- ==========================================================================
  -- SAMSUNG — Galaxy S Series
  -- ==========================================================================
  ('Samsung', 'Galaxy S21',        NULL, 'phone', 'SMS-S21',       '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S21+',       NULL, 'phone', 'SMS-S21PLUS',   '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S21 Ultra',  NULL, 'phone', 'SMS-S21ULTRA',  '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S21 FE',     NULL, 'phone', 'SMS-S21FE',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S22',        NULL, 'phone', 'SMS-S22',       '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S22+',       NULL, 'phone', 'SMS-S22PLUS',   '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S22 Ultra',  NULL, 'phone', 'SMS-S22ULTRA',  '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23',        NULL, 'phone', 'SMS-S23',       '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23+',       NULL, 'phone', 'SMS-S23PLUS',   '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23 Ultra',  NULL, 'phone', 'SMS-S23ULTRA',  '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S23 FE',     NULL, 'phone', 'SMS-S23FE',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24',        NULL, 'phone', 'SMS-S24',       '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24+',       NULL, 'phone', 'SMS-S24PLUS',   '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24 Ultra',  NULL, 'phone', 'SMS-S24ULTRA',  '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S24 FE',     NULL, 'phone', 'SMS-S24FE',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S25',        NULL, 'phone', 'SMS-S25',       '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S25+',       NULL, 'phone', 'SMS-S25PLUS',   '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S25 Ultra',  NULL, 'phone', 'SMS-S25ULTRA',  '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy S25 Edge',   NULL, 'phone', 'SMS-S25EDGE',   '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),

  -- Samsung A-Series
  ('Samsung', 'Galaxy A32',   NULL, 'phone', 'SMS-A32',   '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A52',   NULL, 'phone', 'SMS-A52',   '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A52s',  NULL, 'phone', 'SMS-A52S',  '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A53',   NULL, 'phone', 'SMS-A53',   '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A54',   NULL, 'phone', 'SMS-A54',   '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy A55',   NULL, 'phone', 'SMS-A55',   '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),

  -- Samsung Z-Series (foldables)
  ('Samsung', 'Galaxy Z Fold 4',  NULL, 'phone', 'SMS-ZF4',   '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Fold 5',  NULL, 'phone', 'SMS-ZF5',   '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Fold 6',  NULL, 'phone', 'SMS-ZF6',   '{"storage_options": ["256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Flip 4',  NULL, 'phone', 'SMS-ZFL4',  '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Flip 5',  NULL, 'phone', 'SMS-ZFL5',  '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Z Flip 6',  NULL, 'phone', 'SMS-ZFL6',  '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),

  -- Samsung watches
  ('Samsung', 'Galaxy Watch 4',         NULL, 'watch', 'SMS-GW4',    '{"storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch 4 Classic', NULL, 'watch', 'SMS-GW4C',   '{"storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch 5',         NULL, 'watch', 'SMS-GW5',    '{"storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch 5 Pro',     NULL, 'watch', 'SMS-GW5PRO', '{"storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch 6',         NULL, 'watch', 'SMS-GW6',    '{"storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch 6 Classic', NULL, 'watch', 'SMS-GW6C',   '{"storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch 7',         NULL, 'watch', 'SMS-GW7',    '{"storage_options": ["16GB"]}'::jsonb, true),
  ('Samsung', 'Galaxy Watch Ultra',     NULL, 'watch', 'SMS-GWULTRA','{"storage_options": ["32GB"]}'::jsonb, true),

  -- ==========================================================================
  -- GOOGLE — Pixel Phones
  -- ==========================================================================
  ('Google', 'Pixel 3',      NULL, 'phone', 'GOO-PX3',      '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 3 XL',   NULL, 'phone', 'GOO-PX3XL',    '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 3a',     NULL, 'phone', 'GOO-PX3A',     '{"storage_options": ["64GB"]}'::jsonb, true),
  ('Google', 'Pixel 4',      NULL, 'phone', 'GOO-PX4',      '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 4 XL',   NULL, 'phone', 'GOO-PX4XL',    '{"storage_options": ["64GB", "128GB"]}'::jsonb, true),
  ('Google', 'Pixel 4a',     NULL, 'phone', 'GOO-PX4A',     '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 4a 5G',  NULL, 'phone', 'GOO-PX4A5G',   '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 5',      NULL, 'phone', 'GOO-PX5',      '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 5a',     NULL, 'phone', 'GOO-PX5A',     '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 6',      NULL, 'phone', 'GOO-PX6',      '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 6 Pro',  NULL, 'phone', 'GOO-PX6PRO',   '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Google', 'Pixel 6a',     NULL, 'phone', 'GOO-PX6A',     '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 7',      NULL, 'phone', 'GOO-PX7',      '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 7 Pro',  NULL, 'phone', 'GOO-PX7PRO',   '{"storage_options": ["128GB", "256GB", "512GB"]}'::jsonb, true),
  ('Google', 'Pixel 7a',     NULL, 'phone', 'GOO-PX7A',     '{"storage_options": ["128GB"]}'::jsonb, true),
  ('Google', 'Pixel 8',      NULL, 'phone', 'GOO-PX8',      '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 8 Pro',  NULL, 'phone', 'GOO-PX8PRO',   '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Google', 'Pixel 8a',     NULL, 'phone', 'GOO-PX8A',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 9',      NULL, 'phone', 'GOO-PX9',      '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 9 Pro',  NULL, 'phone', 'GOO-PX9PRO',   '{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Google', 'Pixel 9 Pro XL', NULL, 'phone', 'GOO-PX9PROXL','{"storage_options": ["128GB", "256GB", "512GB", "1TB"]}'::jsonb, true),
  ('Google', 'Pixel 9a',     NULL, 'phone', 'GOO-PX9A',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel 9 Pro Fold', NULL, 'phone', 'GOO-PX9PROFOLD', '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),

  -- Google tablets & watches
  ('Google', 'Pixel Tablet',  NULL, 'tablet', 'GOO-PTAB',   '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Google', 'Pixel Watch',   NULL, 'watch',  'GOO-PWATCH1','{"storage_options": ["32GB"]}'::jsonb, true),
  ('Google', 'Pixel Watch 2', NULL, 'watch',  'GOO-PWATCH2','{"storage_options": ["32GB"]}'::jsonb, true),

  -- ==========================================================================
  -- MOTOROLA — Edge & Moto G
  -- ==========================================================================
  ('Motorola', 'Edge 20',         NULL, 'phone', 'MOT-EDGE20',       '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 30',         NULL, 'phone', 'MOT-EDGE30',       '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 30 Pro',     NULL, 'phone', 'MOT-EDGE30PRO',    '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 40',         NULL, 'phone', 'MOT-EDGE40',       '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 40 Pro',     NULL, 'phone', 'MOT-EDGE40PRO',    '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 50',         NULL, 'phone', 'MOT-EDGE50',       '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Edge 50 Pro',     NULL, 'phone', 'MOT-EDGE50PRO',    '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Motorola', 'Edge 50 Ultra',   NULL, 'phone', 'MOT-EDGE50ULTRA',  '{"storage_options": ["256GB", "512GB"]}'::jsonb, true),
  ('Motorola', 'Moto G 5G (2022)',NULL, 'phone', 'MOT-G5G-2022',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G 5G (2023)',NULL, 'phone', 'MOT-G5G-2023',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G 5G (2024)',NULL, 'phone', 'MOT-G5G-2024',     '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Moto G Stylus (2023)', NULL, 'phone', 'MOT-GSTYLUS-2023', '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Razr (2023)',     NULL, 'phone', 'MOT-RAZR-2023',    '{"storage_options": ["128GB", "256GB"]}'::jsonb, true),
  ('Motorola', 'Razr+ (2023)',    NULL, 'phone', 'MOT-RAZRP-2023',   '{"storage_options": ["256GB"]}'::jsonb, true),
  ('Motorola', 'Razr (2024)',     NULL, 'phone', 'MOT-RAZR-2024',    '{"storage_options": ["256GB"]}'::jsonb, true)

ON CONFLICT (sku) DO NOTHING;
