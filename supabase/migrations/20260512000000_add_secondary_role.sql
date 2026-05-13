-- Add optional secondary role to users table.
-- Allows a single login to access both the vendor and customer portals
-- when the same organization has records in both the vendors and customers tables.
-- RLS policies use organization_id matching (not role) so no policy changes needed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS secondary_role user_role NULL;
