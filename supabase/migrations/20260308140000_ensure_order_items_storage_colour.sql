-- Ensure order_items has storage and colour columns (required for order creation)
-- Some setups may have schema cache or migration-order issues; this guarantees they exist.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS storage VARCHAR(50);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS colour VARCHAR(50);

-- Also add color (American spelling) if only colour exists - some code paths may use either
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS color VARCHAR(50);
