-- ============================================================================
-- MISSING RLS POLICIES MIGRATION
-- ============================================================================
-- Adds RLS policies for tables that have RLS enabled but no access policies:
-- 1. triage_results
-- 2. sla_rules
-- 3. sla_breaches (also enables RLS first)

-- ============================================================================
-- TRIAGE RESULTS POLICIES
-- ============================================================================

create policy "Internal users can view triage results"
  on triage_results for select
  using (
    auth.uid() IN (
      SELECT id FROM users
      WHERE role IN ('admin', 'coe_manager', 'coe_tech')
    )
  );

create policy "COE techs can create triage results"
  on triage_results for insert
  with check (
    auth.uid() IN (
      SELECT id FROM users
      WHERE role IN ('admin', 'coe_tech')
    )
  );

create policy "COE techs can update triage results"
  on triage_results for update
  using (
    auth.uid() IN (
      SELECT id FROM users
      WHERE role IN ('admin', 'coe_tech')
    )
  );

-- ============================================================================
-- SLA RULES POLICIES
-- ============================================================================

create policy "Internal users can view SLA rules"
  on sla_rules for select
  using (
    auth.uid() IN (
      SELECT id FROM users
      WHERE role IN ('admin', 'coe_manager', 'coe_tech', 'sales')
    )
  );

create policy "Admins can insert SLA rules"
  on sla_rules for insert
  with check (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

create policy "Admins can update SLA rules"
  on sla_rules for update
  using (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

create policy "Admins can delete SLA rules"
  on sla_rules for delete
  using (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- ============================================================================
-- SLA BREACHES POLICIES
-- ============================================================================

-- Enable RLS first
alter table sla_breaches enable row level security;

create policy "Internal users can view SLA breaches"
  on sla_breaches for select
  using (
    auth.uid() IN (
      SELECT id FROM users
      WHERE role IN ('admin', 'coe_manager', 'coe_tech', 'sales')
    )
  );

create policy "System can insert SLA breaches"
  on sla_breaches for insert
  with check (true); -- System-level inserts from cron jobs and automated processes
