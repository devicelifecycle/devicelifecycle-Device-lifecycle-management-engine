-- Add notification_email for Login ID users (@login.local)
-- When set, forgot-password and other emails are sent to this address instead.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255);

COMMENT ON COLUMN users.notification_email IS 'Real email for users with auth email @login.local; used for forgot-password, notifications';
