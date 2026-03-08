-- Add configurable competitor ceiling percentage for model-derived trade price

INSERT INTO pricing_settings (setting_key, setting_value, description)
VALUES (
  'competitor_ceiling_percent',
  '2',
  'Max percent premium allowed above top competitor for model-derived trade price'
)
ON CONFLICT (setting_key) DO NOTHING;
