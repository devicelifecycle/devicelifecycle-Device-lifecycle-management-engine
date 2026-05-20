-- Add payment_sent status to order_status enum
-- Sits between delivered and closed for trade-in orders:
-- delivered → payment_sent → closed

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'payment_sent' AFTER 'delivered';
