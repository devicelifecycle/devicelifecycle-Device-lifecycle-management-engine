-- Add catalog entries for common vendor model name variants that may not match
-- existing entries. These are real models (or vendor-named variants) that appear
-- in TD Synnex and similar ITAD trade templates.
-- Uses ON CONFLICT DO NOTHING to avoid duplicate errors on re-run.

INSERT INTO device_catalog (make, model, category, is_active)
VALUES
  -- MacBook Pro 15-inch 2019 (Apple discontinued but vendors still label it this way)
  ('Apple', 'MacBook Pro 15-inch (2019)',   'laptop', true),
  ('Apple', 'MacBook Pro 15-inch 2019',     'laptop', true),
  ('Apple', 'MacBook Pro 2019 15-inch',     'laptop', true),
  -- MacBook Pro 2019 (generic year-only label without screen size)
  ('Apple', 'MacBook Pro (2019)',            'laptop', true),
  ('Apple', 'MacBook Pro 2019',              'laptop', true),
  -- MacBook Pro 2018 (generic, already have size variants but add bare year too)
  ('Apple', 'MacBook Pro (2018)',            'laptop', true),
  ('Apple', 'MacBook Pro 2018',              'laptop', true),
  -- MacBook Pro 2020 variants
  ('Apple', 'MacBook Pro 13-inch (2020)',    'laptop', true),
  ('Apple', 'MacBook Pro 13-inch 2020',     'laptop', true),
  ('Apple', 'MacBook Pro (2020)',            'laptop', true),
  -- MacBook Pro 2017 variants
  ('Apple', 'MacBook Pro 15-inch (2017)',   'laptop', true),
  ('Apple', 'MacBook Pro 13-inch (2017)',   'laptop', true),
  -- MacBook Pro 2016 variants
  ('Apple', 'MacBook Pro 15-inch (2016)',   'laptop', true),
  ('Apple', 'MacBook Pro 13-inch (2016)',   'laptop', true)
ON CONFLICT DO NOTHING;
