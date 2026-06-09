-- Add MacBook Pro 2018 15-inch variants to device catalog.
-- These were missing, causing manual entry to fail and CSV upload to fall back
-- to auto-add (which works but bypasses search/pricing lookup).

INSERT INTO device_catalog (make, model, category, is_active)
VALUES
  ('Apple', 'MacBook Pro 15-inch (2018)',  'laptop', true),
  ('Apple', 'MacBook Pro 15-inch 2018',    'laptop', true),
  ('Apple', 'MacBook Pro 2018 15-inch',    'laptop', true),
  ('Apple', 'MacBook Pro 13-inch (2018)',  'laptop', true),
  ('Apple', 'MacBook Pro 13-inch 2018',    'laptop', true),
  ('Apple', 'MacBook Pro 2018 13-inch',    'laptop', true),
  ('Apple', 'MacBook Pro 16-inch (2019)',  'laptop', true),
  ('Apple', 'MacBook Pro 14-inch (2021)',  'laptop', true),
  ('Apple', 'MacBook Pro 14-inch (2023)',  'laptop', true),
  ('Apple', 'MacBook Pro 16-inch (2021)',  'laptop', true),
  ('Apple', 'MacBook Pro 16-inch (2023)',  'laptop', true),
  ('Apple', 'MacBook Air 13-inch (2020)',  'laptop', true),
  ('Apple', 'MacBook Air 13-inch (2022)',  'laptop', true),
  ('Apple', 'MacBook Air 15-inch (2023)',  'laptop', true),
  ('Apple', 'MacBook Air M2 (2022)',       'laptop', true),
  ('Apple', 'MacBook Air M3 (2024)',       'laptop', true)
ON CONFLICT DO NOTHING;
