-- ============================================================================
-- SECURITY: Tighten sla_breaches insert policy
-- ============================================================================
-- Previous: WITH CHECK (true) allowed any client with anon key to insert.
-- Now: No insert policy for anon key. Inserts are done via SlaService using
--      createServiceRoleClient (bypasses RLS). This prevents client-side abuse.

DROP POLICY IF EXISTS "System can insert SLA breaches" ON sla_breaches;

-- No new INSERT policy: anon key cannot insert. Service role (used by cron)
-- bypasses RLS and can still insert via SlaService.handleBreach.
