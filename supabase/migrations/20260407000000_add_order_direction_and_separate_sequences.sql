-- ============================================================================
-- ADD ORDER DIRECTION & SEPARATE PO/INVOICE SEQUENCES
-- ============================================================================
-- Separates purchase orders (inbound) from sales invoices (outbound) with
-- distinct numbering sequences: PO-YYYY-NNNN vs INV-YYYY-NNNN

-- Step 1: Add order_direction enum type
CREATE TYPE order_direction AS ENUM ('inbound', 'outbound');

-- Step 2: Add order_direction column to orders table
ALTER TABLE orders
ADD COLUMN order_direction order_direction NOT NULL DEFAULT 'inbound';

-- Step 3: Create separate sequences for PO and INV numbering
CREATE SEQUENCE po_number_seq START WITH 1;
CREATE SEQUENCE inv_number_seq START WITH 1;

-- Step 4: Create new generate_order_number function with direction support
CREATE OR REPLACE FUNCTION generate_order_number(direction order_direction)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
  year_part TEXT;
  order_num TEXT;
  prefix TEXT;
BEGIN
  -- Determine prefix based on direction
  prefix := CASE direction
    WHEN 'inbound' THEN 'PO'
    WHEN 'outbound' THEN 'INV'
    ELSE 'ORD'
  END;

  -- Get next value from appropriate sequence (atomic operation)
  next_num := CASE direction
    WHEN 'inbound' THEN nextval('po_number_seq')
    WHEN 'outbound' THEN nextval('inv_number_seq')
    ELSE nextval('po_number_seq')
  END;

  -- Get current year
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

  -- Format: PO-YYYY-NNNN or INV-YYYY-NNNN (e.g., PO-2024-0001, INV-2024-0001)
  order_num := prefix || '-' || year_part || '-' || LPAD(next_num::TEXT, 4, '0');

  RETURN order_num;
END;
$$;

-- Step 5: Backfill order_direction based on type
-- Trade-in orders are inbound (vendor to COE)
-- CPO orders are outbound (COE to customer)
UPDATE orders
SET order_direction = CASE
  WHEN type = 'trade_in' THEN 'inbound'
  WHEN type = 'cpo' THEN 'outbound'
  ELSE 'inbound'
END
WHERE order_direction = 'inbound';

-- Step 6: Initialize sequences to avoid collisions
-- Extract max numeric part from existing order numbers and set sequences
DO $$
DECLARE
  max_po_num INTEGER;
  max_inv_num INTEGER;
BEGIN
  -- Find max PO number (from ORD- format if any trade_ins exist)
  SELECT COALESCE(
    MAX(
      (REGEXP_MATCH(order_number, '([0-9]+)'))[1]::INTEGER
    ),
    0
  ) INTO max_po_num
  FROM orders
  WHERE order_direction = 'inbound' AND order_number ~ '[0-9]+';

  -- Find max INV number (from ORD- format if any CPOs exist)
  SELECT COALESCE(
    MAX(
      (REGEXP_MATCH(order_number, '([0-9]+)'))[1]::INTEGER
    ),
    0
  ) INTO max_inv_num
  FROM orders
  WHERE order_direction = 'outbound' AND order_number ~ '[0-9]+';

  -- Set sequences to start after the highest existing numbers
  PERFORM SETVAL('po_number_seq', max_po_num + 1);
  PERFORM SETVAL('inv_number_seq', max_inv_num + 1);

  RAISE NOTICE 'PO sequence initialized to %, INV sequence initialized to %', max_po_num + 1, max_inv_num + 1;
END;
$$;

-- Step 7: Renumber existing orders to new format
-- Only renumber orders that still have old ORD- format
UPDATE orders
SET order_number = CASE order_direction
  WHEN 'inbound' THEN 'PO-' || TO_CHAR(created_at, 'YYYY') || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY order_direction, DATE_TRUNC('year', created_at) ORDER BY created_at, id)::TEXT, 4, '0')
  WHEN 'outbound' THEN 'INV-' || TO_CHAR(created_at, 'YYYY') || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY order_direction, DATE_TRUNC('year', created_at) ORDER BY created_at, id)::TEXT, 4, '0')
  ELSE order_number
END
WHERE order_number LIKE 'ORD-%';

-- Step 8: Make order_direction NOT NULL if backfill succeeded
ALTER TABLE orders
ALTER COLUMN order_direction SET NOT NULL;

-- Step 9: Add index for direction filtering
CREATE INDEX idx_orders_direction ON orders(order_direction);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- After running this migration, test with:
--
-- -- Generate a few PO numbers
-- SELECT generate_order_number('inbound') FROM GENERATE_SERIES(1, 3);
-- -- Should produce: PO-2024-0001, PO-2024-0002, PO-2024-0003
--
-- -- Generate a few INV numbers
-- SELECT generate_order_number('outbound') FROM GENERATE_SERIES(1, 3);
-- -- Should produce: INV-2024-0001, INV-2024-0002, INV-2024-0003
--
-- -- Verify backfill
-- SELECT order_direction, COUNT(*) FROM orders GROUP BY order_direction;
-- -- Should show: inbound => N (trade-ins), outbound => M (cpOs)
--
-- ============================================================================
