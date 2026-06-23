-- ============================================================================
-- NPS (Net Promoter Score) responses — collected once per closed order.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  submitted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_nps_responses_customer ON nps_responses(customer_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_created ON nps_responses(created_at DESC);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

-- Internal staff can read all responses (for reporting)
CREATE POLICY nps_responses_select_internal ON nps_responses FOR SELECT
  USING (is_internal_user());

-- Customers can read/insert their own org's responses (write goes through
-- the API's service-role client with an application-level org check, same
-- pattern as other customer self-service writes in this codebase — RLS here
-- is a read-time backstop, not the primary write gate).
CREATE POLICY nps_responses_select_own ON nps_responses FOR SELECT
  USING (
    customer_id IN (
      SELECT c.id FROM customers c
      JOIN users u ON u.organization_id = c.organization_id
      WHERE u.id = auth.uid()
    )
  );
