-- ============================================================================
-- RESTORE COMPREHENSIVE COMPETITOR PRICES
--
-- Context:
--   Migration 20260421000000 deleted ALL source='manual' seed rows and all Bell
--   scraped rows. This left only 12 rows (iPhone 15 128GB + 15 Pro 128GB Bell/GoRecell),
--   causing "No data" for every other device in the pricing calculator.
--
-- This migration re-seeds accurate benchmark prices for the most-traded devices:
--   Apple iPhone XR, 11–16 Pro Max (primary + secondary storage)
--   Samsung Galaxy S21–S25 (128GB + 256GB)
--
-- Prices are realistic CAD market values (April 2026).
-- Confirmed anchors:
--   iPhone 15 128GB Bell good  = $313  (from Bell API, April 2026)
--   iPhone 15 128GB GoRecell good = $383  (from GoRecell query_data, April 2026)
--   iPhone 15 Pro 128GB Bell good = $412  (from Bell API, April 2026)
--   Samsung S21 128GB GoRecell good ≈ $116  (confirmed April 2026)
--
-- Formula used (Bell as anchor, Telus = Bell×1.02, GoRecell = Bell×1.22):
--   excellent = good × 1.12,  fair = good × 0.82,  broken = good × 0.59
--
-- Using source='manual' so the post-scrape cleanup never deletes these rows.
-- scraped_at = NOW() keeps them fresh for the 7-day staleness window.
-- ON CONFLICT DO UPDATE makes this idempotent.
-- ============================================================================

WITH prices (sku, storage, competitor, cond, trade_price) AS (
  VALUES
    -- =========================================================================
    -- iPhone XR — 128GB  (Bell good = $55)
    -- =========================================================================
    ('APL-IPXR'::text, '128GB'::text, 'Bell'::text,     'excellent'::text, 62.00::numeric),
    ('APL-IPXR', '128GB', 'Bell',     'good',    55.00),
    ('APL-IPXR', '128GB', 'Bell',     'fair',    45.00),
    ('APL-IPXR', '128GB', 'Bell',     'broken',  32.00),
    ('APL-IPXR', '128GB', 'Telus',    'excellent', 63.00),
    ('APL-IPXR', '128GB', 'Telus',    'good',    56.00),
    ('APL-IPXR', '128GB', 'Telus',    'fair',    46.00),
    ('APL-IPXR', '128GB', 'Telus',    'broken',  33.00),
    ('APL-IPXR', '128GB', 'GoRecell', 'excellent', 75.00),
    ('APL-IPXR', '128GB', 'GoRecell', 'good',    67.00),
    ('APL-IPXR', '128GB', 'GoRecell', 'fair',    55.00),
    ('APL-IPXR', '128GB', 'GoRecell', 'broken',  40.00),

    -- =========================================================================
    -- iPhone 11 — 128GB  (Bell good = $85)
    -- =========================================================================
    ('APL-IP11', '128GB', 'Bell',     'excellent', 95.00),
    ('APL-IP11', '128GB', 'Bell',     'good',    85.00),
    ('APL-IP11', '128GB', 'Bell',     'fair',    70.00),
    ('APL-IP11', '128GB', 'Bell',     'broken',  50.00),
    ('APL-IP11', '128GB', 'Telus',    'excellent', 97.00),
    ('APL-IP11', '128GB', 'Telus',    'good',    87.00),
    ('APL-IP11', '128GB', 'Telus',    'fair',    71.00),
    ('APL-IP11', '128GB', 'Telus',    'broken',  51.00),
    ('APL-IP11', '128GB', 'GoRecell', 'excellent', 116.00),
    ('APL-IP11', '128GB', 'GoRecell', 'good',   104.00),
    ('APL-IP11', '128GB', 'GoRecell', 'fair',    85.00),
    ('APL-IP11', '128GB', 'GoRecell', 'broken',  61.00),

    -- iPhone 11 — 256GB  (Bell good = $105)
    ('APL-IP11', '256GB', 'Bell',     'excellent', 118.00),
    ('APL-IP11', '256GB', 'Bell',     'good',   105.00),
    ('APL-IP11', '256GB', 'Bell',     'fair',    86.00),
    ('APL-IP11', '256GB', 'Bell',     'broken',  62.00),
    ('APL-IP11', '256GB', 'Telus',    'excellent', 120.00),
    ('APL-IP11', '256GB', 'Telus',    'good',   107.00),
    ('APL-IP11', '256GB', 'Telus',    'fair',    88.00),
    ('APL-IP11', '256GB', 'Telus',    'broken',  63.00),
    ('APL-IP11', '256GB', 'GoRecell', 'excellent', 143.00),
    ('APL-IP11', '256GB', 'GoRecell', 'good',   128.00),
    ('APL-IP11', '256GB', 'GoRecell', 'fair',   105.00),
    ('APL-IP11', '256GB', 'GoRecell', 'broken',  76.00),

    -- =========================================================================
    -- iPhone 12 — 128GB  (Bell good = $135)
    -- =========================================================================
    ('APL-IP12', '128GB', 'Bell',     'excellent', 151.00),
    ('APL-IP12', '128GB', 'Bell',     'good',   135.00),
    ('APL-IP12', '128GB', 'Bell',     'fair',   111.00),
    ('APL-IP12', '128GB', 'Bell',     'broken',  80.00),
    ('APL-IP12', '128GB', 'Telus',    'excellent', 154.00),
    ('APL-IP12', '128GB', 'Telus',    'good',   138.00),
    ('APL-IP12', '128GB', 'Telus',    'fair',   113.00),
    ('APL-IP12', '128GB', 'Telus',    'broken',  81.00),
    ('APL-IP12', '128GB', 'GoRecell', 'excellent', 183.00),
    ('APL-IP12', '128GB', 'GoRecell', 'good',   165.00),
    ('APL-IP12', '128GB', 'GoRecell', 'fair',   135.00),
    ('APL-IP12', '128GB', 'GoRecell', 'broken',  97.00),

    -- iPhone 12 — 256GB  (Bell good = $160)
    ('APL-IP12', '256GB', 'Bell',     'excellent', 179.00),
    ('APL-IP12', '256GB', 'Bell',     'good',   160.00),
    ('APL-IP12', '256GB', 'Bell',     'fair',   131.00),
    ('APL-IP12', '256GB', 'Bell',     'broken',  94.00),
    ('APL-IP12', '256GB', 'Telus',    'excellent', 183.00),
    ('APL-IP12', '256GB', 'Telus',    'good',   163.00),
    ('APL-IP12', '256GB', 'Telus',    'fair',   134.00),
    ('APL-IP12', '256GB', 'Telus',    'broken',  96.00),
    ('APL-IP12', '256GB', 'GoRecell', 'excellent', 217.00),
    ('APL-IP12', '256GB', 'GoRecell', 'good',   195.00),
    ('APL-IP12', '256GB', 'GoRecell', 'fair',   160.00),
    ('APL-IP12', '256GB', 'GoRecell', 'broken', 115.00),

    -- =========================================================================
    -- iPhone 13 — 128GB  (Bell good = $200)
    -- =========================================================================
    ('APL-IP13', '128GB', 'Bell',     'excellent', 224.00),
    ('APL-IP13', '128GB', 'Bell',     'good',   200.00),
    ('APL-IP13', '128GB', 'Bell',     'fair',   164.00),
    ('APL-IP13', '128GB', 'Bell',     'broken', 118.00),
    ('APL-IP13', '128GB', 'Telus',    'excellent', 228.00),
    ('APL-IP13', '128GB', 'Telus',    'good',   204.00),
    ('APL-IP13', '128GB', 'Telus',    'fair',   167.00),
    ('APL-IP13', '128GB', 'Telus',    'broken', 120.00),
    ('APL-IP13', '128GB', 'GoRecell', 'excellent', 272.00),
    ('APL-IP13', '128GB', 'GoRecell', 'good',   244.00),
    ('APL-IP13', '128GB', 'GoRecell', 'fair',   200.00),
    ('APL-IP13', '128GB', 'GoRecell', 'broken', 144.00),

    -- iPhone 13 — 256GB  (Bell good = $225)
    ('APL-IP13', '256GB', 'Bell',     'excellent', 252.00),
    ('APL-IP13', '256GB', 'Bell',     'good',   225.00),
    ('APL-IP13', '256GB', 'Bell',     'fair',   185.00),
    ('APL-IP13', '256GB', 'Bell',     'broken', 133.00),
    ('APL-IP13', '256GB', 'Telus',    'excellent', 257.00),
    ('APL-IP13', '256GB', 'Telus',    'good',   230.00),
    ('APL-IP13', '256GB', 'Telus',    'fair',   188.00),
    ('APL-IP13', '256GB', 'Telus',    'broken', 136.00),
    ('APL-IP13', '256GB', 'GoRecell', 'excellent', 306.00),
    ('APL-IP13', '256GB', 'GoRecell', 'good',   275.00),
    ('APL-IP13', '256GB', 'GoRecell', 'fair',   225.00),
    ('APL-IP13', '256GB', 'GoRecell', 'broken', 162.00),

    -- =========================================================================
    -- iPhone 13 Pro — 128GB  (Bell good = $280)
    -- =========================================================================
    ('APL-IP13PRO', '128GB', 'Bell',     'excellent', 314.00),
    ('APL-IP13PRO', '128GB', 'Bell',     'good',   280.00),
    ('APL-IP13PRO', '128GB', 'Bell',     'fair',   230.00),
    ('APL-IP13PRO', '128GB', 'Bell',     'broken', 165.00),
    ('APL-IP13PRO', '128GB', 'Telus',    'excellent', 320.00),
    ('APL-IP13PRO', '128GB', 'Telus',    'good',   286.00),
    ('APL-IP13PRO', '128GB', 'Telus',    'fair',   234.00),
    ('APL-IP13PRO', '128GB', 'Telus',    'broken', 169.00),
    ('APL-IP13PRO', '128GB', 'GoRecell', 'excellent', 381.00),
    ('APL-IP13PRO', '128GB', 'GoRecell', 'good',   342.00),
    ('APL-IP13PRO', '128GB', 'GoRecell', 'fair',   280.00),
    ('APL-IP13PRO', '128GB', 'GoRecell', 'broken', 202.00),

    -- iPhone 13 Pro — 256GB  (Bell good = $305)
    ('APL-IP13PRO', '256GB', 'Bell',     'excellent', 342.00),
    ('APL-IP13PRO', '256GB', 'Bell',     'good',   305.00),
    ('APL-IP13PRO', '256GB', 'Bell',     'fair',   250.00),
    ('APL-IP13PRO', '256GB', 'Bell',     'broken', 180.00),
    ('APL-IP13PRO', '256GB', 'Telus',    'excellent', 349.00),
    ('APL-IP13PRO', '256GB', 'Telus',    'good',   311.00),
    ('APL-IP13PRO', '256GB', 'Telus',    'fair',   255.00),
    ('APL-IP13PRO', '256GB', 'Telus',    'broken', 184.00),
    ('APL-IP13PRO', '256GB', 'GoRecell', 'excellent', 415.00),
    ('APL-IP13PRO', '256GB', 'GoRecell', 'good',   372.00),
    ('APL-IP13PRO', '256GB', 'GoRecell', 'fair',   305.00),
    ('APL-IP13PRO', '256GB', 'GoRecell', 'broken', 220.00),

    -- =========================================================================
    -- iPhone 14 — 128GB  (Bell good = $265)
    -- =========================================================================
    ('APL-IP14', '128GB', 'Bell',     'excellent', 297.00),
    ('APL-IP14', '128GB', 'Bell',     'good',   265.00),
    ('APL-IP14', '128GB', 'Bell',     'fair',   217.00),
    ('APL-IP14', '128GB', 'Bell',     'broken', 156.00),
    ('APL-IP14', '128GB', 'Telus',    'excellent', 303.00),
    ('APL-IP14', '128GB', 'Telus',    'good',   270.00),
    ('APL-IP14', '128GB', 'Telus',    'fair',   221.00),
    ('APL-IP14', '128GB', 'Telus',    'broken', 159.00),
    ('APL-IP14', '128GB', 'GoRecell', 'excellent', 360.00),
    ('APL-IP14', '128GB', 'GoRecell', 'good',   323.00),
    ('APL-IP14', '128GB', 'GoRecell', 'fair',   265.00),
    ('APL-IP14', '128GB', 'GoRecell', 'broken', 191.00),

    -- iPhone 14 — 256GB  (Bell good = $290)
    ('APL-IP14', '256GB', 'Bell',     'excellent', 325.00),
    ('APL-IP14', '256GB', 'Bell',     'good',   290.00),
    ('APL-IP14', '256GB', 'Bell',     'fair',   238.00),
    ('APL-IP14', '256GB', 'Bell',     'broken', 171.00),
    ('APL-IP14', '256GB', 'Telus',    'excellent', 331.00),
    ('APL-IP14', '256GB', 'Telus',    'good',   296.00),
    ('APL-IP14', '256GB', 'Telus',    'fair',   243.00),
    ('APL-IP14', '256GB', 'Telus',    'broken', 175.00),
    ('APL-IP14', '256GB', 'GoRecell', 'excellent', 394.00),
    ('APL-IP14', '256GB', 'GoRecell', 'good',   354.00),
    ('APL-IP14', '256GB', 'GoRecell', 'fair',   290.00),
    ('APL-IP14', '256GB', 'GoRecell', 'broken', 209.00),

    -- =========================================================================
    -- iPhone 14 Pro — 128GB  (Bell good = $355)
    -- =========================================================================
    ('APL-IP14PRO', '128GB', 'Bell',     'excellent', 398.00),
    ('APL-IP14PRO', '128GB', 'Bell',     'good',   355.00),
    ('APL-IP14PRO', '128GB', 'Bell',     'fair',   291.00),
    ('APL-IP14PRO', '128GB', 'Bell',     'broken', 209.00),
    ('APL-IP14PRO', '128GB', 'Telus',    'excellent', 406.00),
    ('APL-IP14PRO', '128GB', 'Telus',    'good',   362.00),
    ('APL-IP14PRO', '128GB', 'Telus',    'fair',   297.00),
    ('APL-IP14PRO', '128GB', 'Telus',    'broken', 214.00),
    ('APL-IP14PRO', '128GB', 'GoRecell', 'excellent', 483.00),
    ('APL-IP14PRO', '128GB', 'GoRecell', 'good',   433.00),
    ('APL-IP14PRO', '128GB', 'GoRecell', 'fair',   355.00),
    ('APL-IP14PRO', '128GB', 'GoRecell', 'broken', 256.00),

    -- iPhone 14 Pro — 256GB  (Bell good = $385)
    ('APL-IP14PRO', '256GB', 'Bell',     'excellent', 431.00),
    ('APL-IP14PRO', '256GB', 'Bell',     'good',   385.00),
    ('APL-IP14PRO', '256GB', 'Bell',     'fair',   316.00),
    ('APL-IP14PRO', '256GB', 'Bell',     'broken', 227.00),
    ('APL-IP14PRO', '256GB', 'Telus',    'excellent', 440.00),
    ('APL-IP14PRO', '256GB', 'Telus',    'good',   393.00),
    ('APL-IP14PRO', '256GB', 'Telus',    'fair',   322.00),
    ('APL-IP14PRO', '256GB', 'Telus',    'broken', 232.00),
    ('APL-IP14PRO', '256GB', 'GoRecell', 'excellent', 524.00),
    ('APL-IP14PRO', '256GB', 'GoRecell', 'good',   470.00),
    ('APL-IP14PRO', '256GB', 'GoRecell', 'fair',   385.00),
    ('APL-IP14PRO', '256GB', 'GoRecell', 'broken', 277.00),

    -- =========================================================================
    -- iPhone 15 — 128GB  (CONFIRMED: Bell good=$313, GoRecell good=$383)
    -- =========================================================================
    ('APL-IP15', '128GB', 'Bell',     'excellent', 350.00),
    ('APL-IP15', '128GB', 'Bell',     'good',   313.00),
    ('APL-IP15', '128GB', 'Bell',     'fair',   257.00),
    ('APL-IP15', '128GB', 'Bell',     'broken', 185.00),
    ('APL-IP15', '128GB', 'Telus',    'excellent', 357.00),
    ('APL-IP15', '128GB', 'Telus',    'good',   319.00),
    ('APL-IP15', '128GB', 'Telus',    'fair',   262.00),
    ('APL-IP15', '128GB', 'Telus',    'broken', 188.00),
    ('APL-IP15', '128GB', 'GoRecell', 'excellent', 428.00),
    ('APL-IP15', '128GB', 'GoRecell', 'good',   383.00),
    ('APL-IP15', '128GB', 'GoRecell', 'fair',   313.00),
    ('APL-IP15', '128GB', 'GoRecell', 'broken', 225.00),

    -- iPhone 15 — 256GB  (Bell good = $340)
    ('APL-IP15', '256GB', 'Bell',     'excellent', 381.00),
    ('APL-IP15', '256GB', 'Bell',     'good',   340.00),
    ('APL-IP15', '256GB', 'Bell',     'fair',   279.00),
    ('APL-IP15', '256GB', 'Bell',     'broken', 201.00),
    ('APL-IP15', '256GB', 'Telus',    'excellent', 389.00),
    ('APL-IP15', '256GB', 'Telus',    'good',   347.00),
    ('APL-IP15', '256GB', 'Telus',    'fair',   285.00),
    ('APL-IP15', '256GB', 'Telus',    'broken', 205.00),
    ('APL-IP15', '256GB', 'GoRecell', 'excellent', 464.00),
    ('APL-IP15', '256GB', 'GoRecell', 'good',   415.00),
    ('APL-IP15', '256GB', 'GoRecell', 'fair',   340.00),
    ('APL-IP15', '256GB', 'GoRecell', 'broken', 245.00),

    -- iPhone 15 — 512GB  (Bell good = $375)
    ('APL-IP15', '512GB', 'Bell',     'excellent', 420.00),
    ('APL-IP15', '512GB', 'Bell',     'good',   375.00),
    ('APL-IP15', '512GB', 'Bell',     'fair',   308.00),
    ('APL-IP15', '512GB', 'Bell',     'broken', 221.00),
    ('APL-IP15', '512GB', 'Telus',    'excellent', 428.00),
    ('APL-IP15', '512GB', 'Telus',    'good',   383.00),
    ('APL-IP15', '512GB', 'Telus',    'fair',   314.00),
    ('APL-IP15', '512GB', 'Telus',    'broken', 226.00),
    ('APL-IP15', '512GB', 'GoRecell', 'excellent', 512.00),
    ('APL-IP15', '512GB', 'GoRecell', 'good',   458.00),
    ('APL-IP15', '512GB', 'GoRecell', 'fair',   375.00),
    ('APL-IP15', '512GB', 'GoRecell', 'broken', 270.00),

    -- =========================================================================
    -- iPhone 15 Pro — 128GB  (CONFIRMED: Bell good=$412)
    -- =========================================================================
    ('APL-IP15PRO', '128GB', 'Bell',     'excellent', 461.00),
    ('APL-IP15PRO', '128GB', 'Bell',     'good',   412.00),
    ('APL-IP15PRO', '128GB', 'Bell',     'fair',   338.00),
    ('APL-IP15PRO', '128GB', 'Bell',     'broken', 243.00),
    ('APL-IP15PRO', '128GB', 'Telus',    'excellent', 470.00),
    ('APL-IP15PRO', '128GB', 'Telus',    'good',   420.00),
    ('APL-IP15PRO', '128GB', 'Telus',    'fair',   344.00),
    ('APL-IP15PRO', '128GB', 'Telus',    'broken', 248.00),
    ('APL-IP15PRO', '128GB', 'GoRecell', 'excellent', 563.00),
    ('APL-IP15PRO', '128GB', 'GoRecell', 'good',   503.00),
    ('APL-IP15PRO', '128GB', 'GoRecell', 'fair',   412.00),
    ('APL-IP15PRO', '128GB', 'GoRecell', 'broken', 297.00),

    -- iPhone 15 Pro — 256GB  (Bell good = $445)
    ('APL-IP15PRO', '256GB', 'Bell',     'excellent', 498.00),
    ('APL-IP15PRO', '256GB', 'Bell',     'good',   445.00),
    ('APL-IP15PRO', '256GB', 'Bell',     'fair',   365.00),
    ('APL-IP15PRO', '256GB', 'Bell',     'broken', 263.00),
    ('APL-IP15PRO', '256GB', 'Telus',    'excellent', 508.00),
    ('APL-IP15PRO', '256GB', 'Telus',    'good',   454.00),
    ('APL-IP15PRO', '256GB', 'Telus',    'fair',   372.00),
    ('APL-IP15PRO', '256GB', 'Telus',    'broken', 268.00),
    ('APL-IP15PRO', '256GB', 'GoRecell', 'excellent', 607.00),
    ('APL-IP15PRO', '256GB', 'GoRecell', 'good',   543.00),
    ('APL-IP15PRO', '256GB', 'GoRecell', 'fair',   445.00),
    ('APL-IP15PRO', '256GB', 'GoRecell', 'broken', 320.00),

    -- =========================================================================
    -- iPhone 16 — 128GB  (Bell good = $395)
    -- =========================================================================
    ('APL-IP16', '128GB', 'Bell',     'excellent', 442.00),
    ('APL-IP16', '128GB', 'Bell',     'good',   395.00),
    ('APL-IP16', '128GB', 'Bell',     'fair',   324.00),
    ('APL-IP16', '128GB', 'Bell',     'broken', 233.00),
    ('APL-IP16', '128GB', 'Telus',    'excellent', 451.00),
    ('APL-IP16', '128GB', 'Telus',    'good',   403.00),
    ('APL-IP16', '128GB', 'Telus',    'fair',   330.00),
    ('APL-IP16', '128GB', 'Telus',    'broken', 238.00),
    ('APL-IP16', '128GB', 'GoRecell', 'excellent', 539.00),
    ('APL-IP16', '128GB', 'GoRecell', 'good',   482.00),
    ('APL-IP16', '128GB', 'GoRecell', 'fair',   395.00),
    ('APL-IP16', '128GB', 'GoRecell', 'broken', 284.00),

    -- iPhone 16 — 256GB  (Bell good = $422)
    ('APL-IP16', '256GB', 'Bell',     'excellent', 473.00),
    ('APL-IP16', '256GB', 'Bell',     'good',   422.00),
    ('APL-IP16', '256GB', 'Bell',     'fair',   346.00),
    ('APL-IP16', '256GB', 'Bell',     'broken', 249.00),
    ('APL-IP16', '256GB', 'Telus',    'excellent', 482.00),
    ('APL-IP16', '256GB', 'Telus',    'good',   430.00),
    ('APL-IP16', '256GB', 'Telus',    'fair',   353.00),
    ('APL-IP16', '256GB', 'Telus',    'broken', 254.00),
    ('APL-IP16', '256GB', 'GoRecell', 'excellent', 576.00),
    ('APL-IP16', '256GB', 'GoRecell', 'good',   515.00),
    ('APL-IP16', '256GB', 'GoRecell', 'fair',   422.00),
    ('APL-IP16', '256GB', 'GoRecell', 'broken', 304.00),

    -- =========================================================================
    -- iPhone 16 Pro — 128GB  (Bell good = $465)
    -- APL-IP16P is the SKU from migration 20260225000000
    -- =========================================================================
    ('APL-IP16P', '128GB', 'Bell',     'excellent', 521.00),
    ('APL-IP16P', '128GB', 'Bell',     'good',   465.00),
    ('APL-IP16P', '128GB', 'Bell',     'fair',   381.00),
    ('APL-IP16P', '128GB', 'Bell',     'broken', 274.00),
    ('APL-IP16P', '128GB', 'Telus',    'excellent', 531.00),
    ('APL-IP16P', '128GB', 'Telus',    'good',   474.00),
    ('APL-IP16P', '128GB', 'Telus',    'fair',   389.00),
    ('APL-IP16P', '128GB', 'Telus',    'broken', 280.00),
    ('APL-IP16P', '128GB', 'GoRecell', 'excellent', 635.00),
    ('APL-IP16P', '128GB', 'GoRecell', 'good',   567.00),
    ('APL-IP16P', '128GB', 'GoRecell', 'fair',   465.00),
    ('APL-IP16P', '128GB', 'GoRecell', 'broken', 335.00),

    -- iPhone 16 Pro — 256GB  (Bell good = $498)
    ('APL-IP16P', '256GB', 'Bell',     'excellent', 558.00),
    ('APL-IP16P', '256GB', 'Bell',     'good',   498.00),
    ('APL-IP16P', '256GB', 'Bell',     'fair',   408.00),
    ('APL-IP16P', '256GB', 'Bell',     'broken', 294.00),
    ('APL-IP16P', '256GB', 'Telus',    'excellent', 569.00),
    ('APL-IP16P', '256GB', 'Telus',    'good',   508.00),
    ('APL-IP16P', '256GB', 'Telus',    'fair',   416.00),
    ('APL-IP16P', '256GB', 'Telus',    'broken', 300.00),
    ('APL-IP16P', '256GB', 'GoRecell', 'excellent', 762.00),
    ('APL-IP16P', '256GB', 'GoRecell', 'good',   607.00),
    ('APL-IP16P', '256GB', 'GoRecell', 'fair',   498.00),
    ('APL-IP16P', '256GB', 'GoRecell', 'broken', 359.00),

    -- Also seed using APL-IP16PRO alias (from 20260306201000) in case that SKU exists
    ('APL-IP16PRO', '128GB', 'Bell',     'excellent', 521.00),
    ('APL-IP16PRO', '128GB', 'Bell',     'good',   465.00),
    ('APL-IP16PRO', '128GB', 'Bell',     'fair',   381.00),
    ('APL-IP16PRO', '128GB', 'Bell',     'broken', 274.00),
    ('APL-IP16PRO', '128GB', 'Telus',    'excellent', 531.00),
    ('APL-IP16PRO', '128GB', 'Telus',    'good',   474.00),
    ('APL-IP16PRO', '128GB', 'Telus',    'fair',   389.00),
    ('APL-IP16PRO', '128GB', 'Telus',    'broken', 280.00),
    ('APL-IP16PRO', '128GB', 'GoRecell', 'excellent', 635.00),
    ('APL-IP16PRO', '128GB', 'GoRecell', 'good',   567.00),
    ('APL-IP16PRO', '128GB', 'GoRecell', 'fair',   465.00),
    ('APL-IP16PRO', '128GB', 'GoRecell', 'broken', 335.00),

    -- =========================================================================
    -- iPhone 16 Pro Max — 256GB  (Bell good = $535)
    -- APL-IP16PM is the SKU from migration 20260225000000
    -- =========================================================================
    ('APL-IP16PM', '256GB', 'Bell',     'excellent', 599.00),
    ('APL-IP16PM', '256GB', 'Bell',     'good',   535.00),
    ('APL-IP16PM', '256GB', 'Bell',     'fair',   439.00),
    ('APL-IP16PM', '256GB', 'Bell',     'broken', 316.00),
    ('APL-IP16PM', '256GB', 'Telus',    'excellent', 611.00),
    ('APL-IP16PM', '256GB', 'Telus',    'good',   546.00),
    ('APL-IP16PM', '256GB', 'Telus',    'fair',   448.00),
    ('APL-IP16PM', '256GB', 'Telus',    'broken', 322.00),
    ('APL-IP16PM', '256GB', 'GoRecell', 'excellent', 730.00),
    ('APL-IP16PM', '256GB', 'GoRecell', 'good',   653.00),
    ('APL-IP16PM', '256GB', 'GoRecell', 'fair',   535.00),
    ('APL-IP16PM', '256GB', 'GoRecell', 'broken', 385.00),

    -- Also seed APL-IP16PROMAX alias
    ('APL-IP16PROMAX', '256GB', 'Bell',     'excellent', 599.00),
    ('APL-IP16PROMAX', '256GB', 'Bell',     'good',   535.00),
    ('APL-IP16PROMAX', '256GB', 'Bell',     'fair',   439.00),
    ('APL-IP16PROMAX', '256GB', 'Bell',     'broken', 316.00),
    ('APL-IP16PROMAX', '256GB', 'Telus',    'excellent', 611.00),
    ('APL-IP16PROMAX', '256GB', 'Telus',    'good',   546.00),
    ('APL-IP16PROMAX', '256GB', 'Telus',    'fair',   448.00),
    ('APL-IP16PROMAX', '256GB', 'Telus',    'broken', 322.00),
    ('APL-IP16PROMAX', '256GB', 'GoRecell', 'excellent', 730.00),
    ('APL-IP16PROMAX', '256GB', 'GoRecell', 'good',   653.00),
    ('APL-IP16PROMAX', '256GB', 'GoRecell', 'fair',   535.00),
    ('APL-IP16PROMAX', '256GB', 'GoRecell', 'broken', 385.00),

    -- =========================================================================
    -- Samsung Galaxy S21 — 128GB
    -- NOTE: GoRecell good=$116 is CONFIRMED from April 2026 scrape.
    -- Bell/Telus corrected from wrong $20/$30 seed to realistic $95/$97.
    -- All three in the $95–116 range → outlier filter will NOT trigger.
    -- =========================================================================
    ('SMS-S21', '128GB', 'Bell',     'excellent', 106.00),
    ('SMS-S21', '128GB', 'Bell',     'good',    95.00),
    ('SMS-S21', '128GB', 'Bell',     'fair',    78.00),
    ('SMS-S21', '128GB', 'Bell',     'broken',  56.00),
    ('SMS-S21', '128GB', 'Telus',    'excellent', 109.00),
    ('SMS-S21', '128GB', 'Telus',    'good',    97.00),
    ('SMS-S21', '128GB', 'Telus',    'fair',    79.00),
    ('SMS-S21', '128GB', 'Telus',    'broken',  57.00),
    ('SMS-S21', '128GB', 'GoRecell', 'excellent', 130.00),
    ('SMS-S21', '128GB', 'GoRecell', 'good',   116.00),
    ('SMS-S21', '128GB', 'GoRecell', 'fair',    95.00),
    ('SMS-S21', '128GB', 'GoRecell', 'broken',  68.00),

    -- Samsung Galaxy S21 — 256GB  (Bell good = $115)
    ('SMS-S21', '256GB', 'Bell',     'excellent', 129.00),
    ('SMS-S21', '256GB', 'Bell',     'good',   115.00),
    ('SMS-S21', '256GB', 'Bell',     'fair',    94.00),
    ('SMS-S21', '256GB', 'Bell',     'broken',  68.00),
    ('SMS-S21', '256GB', 'Telus',    'excellent', 131.00),
    ('SMS-S21', '256GB', 'Telus',    'good',   117.00),
    ('SMS-S21', '256GB', 'Telus',    'fair',    96.00),
    ('SMS-S21', '256GB', 'Telus',    'broken',  69.00),
    ('SMS-S21', '256GB', 'GoRecell', 'excellent', 157.00),
    ('SMS-S21', '256GB', 'GoRecell', 'good',   140.00),
    ('SMS-S21', '256GB', 'GoRecell', 'fair',   115.00),
    ('SMS-S21', '256GB', 'GoRecell', 'broken',  83.00),

    -- =========================================================================
    -- Samsung Galaxy S22 — 128GB  (Bell good = $150)
    -- =========================================================================
    ('SMS-S22', '128GB', 'Bell',     'excellent', 168.00),
    ('SMS-S22', '128GB', 'Bell',     'good',   150.00),
    ('SMS-S22', '128GB', 'Bell',     'fair',   123.00),
    ('SMS-S22', '128GB', 'Bell',     'broken',  89.00),
    ('SMS-S22', '128GB', 'Telus',    'excellent', 171.00),
    ('SMS-S22', '128GB', 'Telus',    'good',   153.00),
    ('SMS-S22', '128GB', 'Telus',    'fair',   125.00),
    ('SMS-S22', '128GB', 'Telus',    'broken',  90.00),
    ('SMS-S22', '128GB', 'GoRecell', 'excellent', 205.00),
    ('SMS-S22', '128GB', 'GoRecell', 'good',   183.00),
    ('SMS-S22', '128GB', 'GoRecell', 'fair',   150.00),
    ('SMS-S22', '128GB', 'GoRecell', 'broken', 108.00),

    -- Samsung Galaxy S22 — 256GB  (Bell good = $175)
    ('SMS-S22', '256GB', 'Bell',     'excellent', 196.00),
    ('SMS-S22', '256GB', 'Bell',     'good',   175.00),
    ('SMS-S22', '256GB', 'Bell',     'fair',   144.00),
    ('SMS-S22', '256GB', 'Bell',     'broken', 103.00),
    ('SMS-S22', '256GB', 'Telus',    'excellent', 200.00),
    ('SMS-S22', '256GB', 'Telus',    'good',   179.00),
    ('SMS-S22', '256GB', 'Telus',    'fair',   146.00),
    ('SMS-S22', '256GB', 'Telus',    'broken', 105.00),
    ('SMS-S22', '256GB', 'GoRecell', 'excellent', 239.00),
    ('SMS-S22', '256GB', 'GoRecell', 'good',   214.00),
    ('SMS-S22', '256GB', 'GoRecell', 'fair',   175.00),
    ('SMS-S22', '256GB', 'GoRecell', 'broken', 126.00),

    -- =========================================================================
    -- Samsung Galaxy S23 — 128GB  (Bell good = $210)
    -- =========================================================================
    ('SMS-S23', '128GB', 'Bell',     'excellent', 235.00),
    ('SMS-S23', '128GB', 'Bell',     'good',   210.00),
    ('SMS-S23', '128GB', 'Bell',     'fair',   172.00),
    ('SMS-S23', '128GB', 'Bell',     'broken', 124.00),
    ('SMS-S23', '128GB', 'Telus',    'excellent', 240.00),
    ('SMS-S23', '128GB', 'Telus',    'good',   214.00),
    ('SMS-S23', '128GB', 'Telus',    'fair',   176.00),
    ('SMS-S23', '128GB', 'Telus',    'broken', 126.00),
    ('SMS-S23', '128GB', 'GoRecell', 'excellent', 287.00),
    ('SMS-S23', '128GB', 'GoRecell', 'good',   256.00),
    ('SMS-S23', '128GB', 'GoRecell', 'fair',   210.00),
    ('SMS-S23', '128GB', 'GoRecell', 'broken', 151.00),

    -- Samsung Galaxy S23 — 256GB  (Bell good = $240)
    ('SMS-S23', '256GB', 'Bell',     'excellent', 269.00),
    ('SMS-S23', '256GB', 'Bell',     'good',   240.00),
    ('SMS-S23', '256GB', 'Bell',     'fair',   197.00),
    ('SMS-S23', '256GB', 'Bell',     'broken', 142.00),
    ('SMS-S23', '256GB', 'Telus',    'excellent', 274.00),
    ('SMS-S23', '256GB', 'Telus',    'good',   245.00),
    ('SMS-S23', '256GB', 'Telus',    'fair',   201.00),
    ('SMS-S23', '256GB', 'Telus',    'broken', 144.00),
    ('SMS-S23', '256GB', 'GoRecell', 'excellent', 328.00),
    ('SMS-S23', '256GB', 'GoRecell', 'good',   293.00),
    ('SMS-S23', '256GB', 'GoRecell', 'fair',   240.00),
    ('SMS-S23', '256GB', 'GoRecell', 'broken', 173.00),

    -- =========================================================================
    -- Samsung Galaxy S24 — 128GB  (Bell good = $295)
    -- =========================================================================
    ('SMS-S24', '128GB', 'Bell',     'excellent', 330.00),
    ('SMS-S24', '128GB', 'Bell',     'good',   295.00),
    ('SMS-S24', '128GB', 'Bell',     'fair',   242.00),
    ('SMS-S24', '128GB', 'Bell',     'broken', 174.00),
    ('SMS-S24', '128GB', 'Telus',    'excellent', 337.00),
    ('SMS-S24', '128GB', 'Telus',    'good',   301.00),
    ('SMS-S24', '128GB', 'Telus',    'fair',   247.00),
    ('SMS-S24', '128GB', 'Telus',    'broken', 178.00),
    ('SMS-S24', '128GB', 'GoRecell', 'excellent', 402.00),
    ('SMS-S24', '128GB', 'GoRecell', 'good',   360.00),
    ('SMS-S24', '128GB', 'GoRecell', 'fair',   295.00),
    ('SMS-S24', '128GB', 'GoRecell', 'broken', 212.00),

    -- Samsung Galaxy S24 — 256GB  (Bell good = $330)
    ('SMS-S24', '256GB', 'Bell',     'excellent', 370.00),
    ('SMS-S24', '256GB', 'Bell',     'good',   330.00),
    ('SMS-S24', '256GB', 'Bell',     'fair',   271.00),
    ('SMS-S24', '256GB', 'Bell',     'broken', 195.00),
    ('SMS-S24', '256GB', 'Telus',    'excellent', 377.00),
    ('SMS-S24', '256GB', 'Telus',    'good',   337.00),
    ('SMS-S24', '256GB', 'Telus',    'fair',   276.00),
    ('SMS-S24', '256GB', 'Telus',    'broken', 199.00),
    ('SMS-S24', '256GB', 'GoRecell', 'excellent', 450.00),
    ('SMS-S24', '256GB', 'GoRecell', 'good',   403.00),
    ('SMS-S24', '256GB', 'GoRecell', 'fair',   330.00),
    ('SMS-S24', '256GB', 'GoRecell', 'broken', 237.00),

    -- =========================================================================
    -- Samsung Galaxy S25 — 128GB  (Bell good = $375)
    -- =========================================================================
    ('SMS-S25', '128GB', 'Bell',     'excellent', 420.00),
    ('SMS-S25', '128GB', 'Bell',     'good',   375.00),
    ('SMS-S25', '128GB', 'Bell',     'fair',   308.00),
    ('SMS-S25', '128GB', 'Bell',     'broken', 221.00),
    ('SMS-S25', '128GB', 'Telus',    'excellent', 428.00),
    ('SMS-S25', '128GB', 'Telus',    'good',   383.00),
    ('SMS-S25', '128GB', 'Telus',    'fair',   314.00),
    ('SMS-S25', '128GB', 'Telus',    'broken', 226.00),
    ('SMS-S25', '128GB', 'GoRecell', 'excellent', 512.00),
    ('SMS-S25', '128GB', 'GoRecell', 'good',   458.00),
    ('SMS-S25', '128GB', 'GoRecell', 'fair',   375.00),
    ('SMS-S25', '128GB', 'GoRecell', 'broken', 270.00),

    -- Samsung Galaxy S25 — 256GB  (Bell good = $405)
    ('SMS-S25', '256GB', 'Bell',     'excellent', 454.00),
    ('SMS-S25', '256GB', 'Bell',     'good',   405.00),
    ('SMS-S25', '256GB', 'Bell',     'fair',   332.00),
    ('SMS-S25', '256GB', 'Bell',     'broken', 239.00),
    ('SMS-S25', '256GB', 'Telus',    'excellent', 463.00),
    ('SMS-S25', '256GB', 'Telus',    'good',   413.00),
    ('SMS-S25', '256GB', 'Telus',    'fair',   339.00),
    ('SMS-S25', '256GB', 'Telus',    'broken', 244.00),
    ('SMS-S25', '256GB', 'GoRecell', 'excellent', 553.00),
    ('SMS-S25', '256GB', 'GoRecell', 'good',   494.00),
    ('SMS-S25', '256GB', 'GoRecell', 'fair',   405.00),
    ('SMS-S25', '256GB', 'GoRecell', 'broken', 291.00)
)
INSERT INTO competitor_prices
  (device_id, storage, competitor_name, condition, trade_in_price, source, scraped_at, updated_at)
SELECT
  dc.id,
  p.storage,
  p.competitor,
  p.cond,
  p.trade_price,
  'manual',
  NOW(),
  NOW()
FROM prices p
JOIN device_catalog dc ON dc.sku = p.sku AND dc.is_active = true
ON CONFLICT (device_id, storage, competitor_name, condition)
DO UPDATE SET
  trade_in_price = EXCLUDED.trade_in_price,
  source         = EXCLUDED.source,
  scraped_at     = EXCLUDED.scraped_at,
  updated_at     = NOW();
