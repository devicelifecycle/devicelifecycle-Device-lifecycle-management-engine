-- ============================================================================
-- TRAINED SLA BASELINES
-- Mirrors trained_pricing_baselines (20260226000000): a periodically
-- retrained, recency-weighted baseline per (status, order_type) — how long
-- orders of this type typically spend in this stage — read by the SLA
-- early-warning heuristic (src/services/sla-prediction.service.ts) instead
-- of recomputing the aggregate live on every dashboard load.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trained_sla_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(50) NOT NULL,
    order_type order_type NOT NULL,

    weighted_avg_hours DECIMAL(10, 2) NOT NULL,
    p25_hours DECIMAL(10, 2),
    p75_hours DECIMAL(10, 2),
    sample_count INTEGER NOT NULL DEFAULT 0,

    last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(status, order_type)
);

CREATE INDEX IF NOT EXISTS idx_trained_sla_baselines_lookup ON trained_sla_baselines(status, order_type);

ALTER TABLE trained_sla_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage trained SLA baselines"
    ON trained_sla_baselines FOR ALL
    USING (is_internal_user());

CREATE TRIGGER update_trained_sla_baselines_updated_at
    BEFORE UPDATE ON trained_sla_baselines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
