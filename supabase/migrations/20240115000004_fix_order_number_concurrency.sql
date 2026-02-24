-- ============================================================================
-- FIX ORDER NUMBER GENERATION FOR CONCURRENCY
-- ============================================================================
-- Replaces the existing generate_order_number() function with a sequence-based
-- implementation to prevent duplicate order numbers under concurrent load.

-- Drop existing function
drop function if exists generate_order_number();

-- Create sequence for order numbers (atomic counter)
create sequence if not exists order_number_seq start 1;

-- Create improved function using sequence
create or replace function generate_order_number()
returns text
language plpgsql
as $$
declare
  next_num integer;
  year_part text;
  order_num text;
begin
  -- Get next value from sequence (atomic operation)
  next_num := nextval('order_number_seq');

  -- Get current year
  year_part := to_char(current_date, 'YYYY');

  -- Format: ORD-YYYY-NNNN (e.g., ORD-2024-0001)
  order_num := 'ORD-' || year_part || '-' || lpad(next_num::text, 4, '0');

  return order_num;
end;
$$;

-- Reset sequence to match existing max order number (if any exist)
-- This ensures no collisions with existing order numbers
do $$
declare
  max_existing_num integer;
begin
  -- Extract the numeric part from existing order numbers
  -- Format: ORD-YYYY-NNNN, extract NNNN
  select coalesce(
    max(
      (regexp_match(order_number, 'ORD-[0-9]{4}-([0-9]+)'))[1]::integer
    ),
    0
  )
  into max_existing_num
  from orders
  where order_number ~ 'ORD-[0-9]{4}-[0-9]+';

  -- Set sequence to start after the highest existing number
  perform setval('order_number_seq', max_existing_num);

  raise notice 'Order number sequence initialized to %', max_existing_num;
end;
$$;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- After running this migration, you can test with:
--
-- SELECT generate_order_number() FROM generate_series(1, 10);
--
-- This should produce:
-- ORD-2024-0001
-- ORD-2024-0002
-- ORD-2024-0003
-- etc.
-- ============================================================================
