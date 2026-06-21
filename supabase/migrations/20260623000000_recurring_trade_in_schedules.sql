-- ============================================================================
-- RECURRING TRADE-IN REMINDERS
-- ============================================================================
-- A customer org can opt into a reminder cadence (e.g. quarterly) for their
-- next trade-in batch. Reminder-only by design: devices aren't known in
-- advance, so this never auto-creates an order — it just nudges the
-- customer to submit their next batch when the scheduled date arrives.
-- ============================================================================

CREATE TYPE recurring_reminder_frequency AS ENUM ('monthly', 'quarterly', 'semi_annually', 'annually');

CREATE TABLE IF NOT EXISTS recurring_trade_in_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    frequency recurring_reminder_frequency NOT NULL,
    next_reminder_at TIMESTAMPTZ NOT NULL,
    last_reminded_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_due ON recurring_trade_in_schedules(next_reminder_at) WHERE is_active = true;

ALTER TABLE recurring_trade_in_schedules ENABLE ROW LEVEL SECURITY;

-- Same pattern as customers_update/vendors_update — internal-only via RLS;
-- the customer self-service route (PATCH /api/customers/me/recurring-schedule)
-- uses the service-role client with the org match as the real gate, same as
-- the other self-service routes added alongside this one.
CREATE POLICY "Internal users can manage recurring schedules"
    ON recurring_trade_in_schedules FOR ALL
    USING (is_internal_user());

CREATE TRIGGER update_recurring_schedules_updated_at
    BEFORE UPDATE ON recurring_trade_in_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
