-- ============================================================================
-- MULTI-VENDOR ORDER SPLITTING
-- Allows splitting a parent order into sub-orders assigned to different vendors
-- ============================================================================

-- 1. Add split columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_split_order BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_strategy VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id ON orders(parent_order_id);

-- 2. Add split columns to order_items table
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocated_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_parent_item_id ON order_items(parent_item_id);

-- 3. Add allocation columns to vendor_bids table
ALTER TABLE vendor_bids
  ADD COLUMN IF NOT EXISTS quantity_allocated INTEGER,
  ADD COLUMN IF NOT EXISTS sub_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN DEFAULT false;

-- 4. Create order_splits audit table
CREATE TABLE IF NOT EXISTS order_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sub_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  split_items JSONB NOT NULL DEFAULT '[]',
  split_by_user_id UUID REFERENCES auth.users(id),
  split_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_splits_parent ON order_splits(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_order_splits_sub ON order_splits(sub_order_id);

-- 5. RLS policies for order_splits
ALTER TABLE order_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order splits"
  ON order_splits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert order splits"
  ON order_splits FOR INSERT
  TO authenticated
  WITH CHECK (true);
