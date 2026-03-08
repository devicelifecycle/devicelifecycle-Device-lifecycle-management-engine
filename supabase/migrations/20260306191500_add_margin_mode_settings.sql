-- ============================================================================
-- Add margin mode settings (Auto/Custom)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pricing_settings'
  ) THEN
    INSERT INTO pricing_settings (setting_key, setting_value, description)
    VALUES
      ('margin_mode', 'auto', 'Margin mode: auto or custom'),
      ('custom_margin_percent', '0', 'Custom margin percentage when margin_mode=custom'),
      ('custom_margin_amount', '0', 'Custom margin amount when margin_mode=custom')
    ON CONFLICT (setting_key) DO NOTHING;
  END IF;
END $$;
