-- ============================================================================
-- ADD MOBILE CARRIER FIELD TO CUSTOMERS
-- Used for free SMS notifications via email-to-SMS carrier gateways
-- ============================================================================

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS mobile_carrier VARCHAR(50);

COMMENT ON COLUMN customers.mobile_carrier IS 'Mobile carrier for SMS via email-to-SMS gateway (e.g., bell, telus, rogers, fido, koodo, virgin, freedom, chatr)';
