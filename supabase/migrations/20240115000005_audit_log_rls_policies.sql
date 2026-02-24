-- ============================================================================
-- AUDIT LOG ROW LEVEL SECURITY POLICIES
-- ============================================================================
-- Without these, any authenticated user can read every audit log entry
-- (all users' actions, all entity changes) - a significant data exposure risk.

-- Enable RLS on audit_logs (may already be enabled from initial schema)
alter table audit_logs enable row level security;

-- ============================================================================
-- SELECT POLICIES
-- ============================================================================

-- Admins and CoE managers can view all audit logs
create policy "Admins can view all audit logs"
  on audit_logs for select
  using (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'coe_manager')
    )
  );

-- CoE techs and sales can view their own actions + logs for entities in their org
create policy "Internal users can view their own audit logs"
  on audit_logs for select
  using (
    auth.uid() = user_id
    AND auth.uid() IN (
      SELECT id FROM users WHERE role IN ('coe_tech', 'sales')
    )
  );

-- Customers can only view their own audit activity
create policy "Customers can view their own audit logs"
  on audit_logs for select
  using (
    auth.uid() = user_id
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'customer'
    )
  );

-- Vendors can only view their own audit activity
create policy "Vendors can view their own audit logs"
  on audit_logs for select
  using (
    auth.uid() = user_id
    AND auth.uid() IN (
      SELECT id FROM users WHERE role = 'vendor'
    )
  );

-- ============================================================================
-- INSERT POLICY
-- ============================================================================

-- Only the system (service role) and authenticated users can insert their own logs.
-- Prevents users from forging audit entries for other users.
create policy "Users can only insert their own audit logs"
  on audit_logs for insert
  with check (
    auth.uid() = user_id
  );

-- ============================================================================
-- UPDATE / DELETE POLICIES
-- ============================================================================

-- Audit logs are immutable - no one can update or delete them
-- (No update/delete policies = no one can modify audit records)
-- This is intentional for audit integrity.
