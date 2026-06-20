-- Designates one user per customer/vendor organization as that org's own
-- admin, able to invite teammates (same role, same org) and deactivate them
-- without the platform admin provisioning every login. Only the platform
-- admin can set this flag (enforced at the API layer in
-- PATCH /api/users/[id], not via RLS — same pattern already used for
-- secondary_role).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_org_admin BOOLEAN NOT NULL DEFAULT false;
