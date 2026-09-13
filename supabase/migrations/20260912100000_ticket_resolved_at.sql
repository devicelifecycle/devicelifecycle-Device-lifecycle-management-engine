-- ============================================================================
-- TICKETS — track when a ticket actually resolved, for accurate SLA reporting
-- 2026-09-12
--
-- ticketSlaState() (src/lib/tickets.ts) treated every resolved/closed ticket
-- as "met" regardless of when it was actually resolved, because there was no
-- column to compare against sla_due_at — a ticket resolved a week late still
-- reported as SLA-met. Additive only.
-- ============================================================================

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
