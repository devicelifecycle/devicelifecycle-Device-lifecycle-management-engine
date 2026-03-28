-- Ensure beat_competitor_percent defaults to 2 when not set (enables competitive quotes)
INSERT INTO pricing_settings (setting_key, setting_value, description)
VALUES (
  'beat_competitor_percent',
  '2',
  'Offer X% above highest competitor to win deals. 0=off, 2-5=aggressive.'
)
ON CONFLICT (setting_key) DO NOTHING;
