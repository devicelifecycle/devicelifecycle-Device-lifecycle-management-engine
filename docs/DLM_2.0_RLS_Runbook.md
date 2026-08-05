# DLM 2.0 — Tenant-Isolation RLS Apply / Verify / Rollback Runbook

**Month 1.5 of the DLM 2.0 plan.** This is the one live-DB step that is hard to
reverse, so it is gated behind explicit go-ahead and this runbook.

Migration under test: `supabase/migrations/20260801000000_tenant_isolation_rls.sql`

## Why this is safe by construction

- The `tenant_isolation` policy is **RESTRICTIVE**, so it is AND-ed with the
  existing role policies. It can only ever **narrow** access, never widen it.
- Every tenant-scoped table's `tenant_id` is `NOT NULL DEFAULT <platform>`
  (added in `20260729000000_multitenant_core.sql`). Postgres fast-default
  backfilled every pre-existing row to the platform tenant, so **no row has a
  NULL tenant_id** — nothing can silently disappear.
- The policy's `USING`/`WITH CHECK` short-circuits to `true` when
  `auth.role() = 'service_role'` (all server-side service-role queries) or when
  `auth_tenant_id() IS NULL`. For a normal platform user it evaluates
  `tenant_id = auth_tenant_id()`, which is `platform = platform` → true.
- `auth_tenant_id()` is `STABLE`, evaluated once per statement, so there is no
  per-row overhead.

**Net effect today (platform-only data): a no-op.** Isolation only starts to
bite once VAR users and VAR-scoped rows exist.

## Pre-flight verification (run FIRST, read-only)

Run in the Supabase SQL editor against production. All three must pass before
applying.

```sql
-- 1. auth_tenant_id() exists and is STABLE.
select proname, provolatile
from pg_proc where proname = 'auth_tenant_id';
-- expect: one row, provolatile = 's'

-- 2. No tenant-scoped row has a NULL tenant_id (would vanish once enforced).
--    Repeat per table, or trust the NOT NULL constraint below.
select table_name
from information_schema.columns
where column_name = 'tenant_id' and is_nullable = 'YES'
  and table_schema = 'public';
-- expect: 0 rows (every tenant_id column is NOT NULL)

-- 3. Every user maps to a tenant (so auth_tenant_id() is never unexpectedly null).
select count(*) as users_without_tenant from users where tenant_id is null;
-- expect: 0
```

## Apply

```powershell
# From repo root. Pushes all pending migrations, including tenant_isolation_rls.
supabase db push
```

`DROP POLICY IF EXISTS` + `CREATE POLICY` make the migration **idempotent** — safe
to run whether or not it was applied before.

## Post-apply verification

```sql
-- The policy is present on the core tenant-scoped tables.
select tablename from pg_policies where policyname = 'tenant_isolation' order by tablename;

-- As a signed-in platform user (NOT the service role), row counts are unchanged.
-- Run these in the app or with an anon/authenticated JWT, and compare to the
-- numbers you captured before applying.
select count(*) from orders;
select count(*) from customers;
```

Then, in the app: log in as `admin` (and one customer, one vendor) and confirm
dashboards, orders, and customers all load exactly as before. **Any empty list
that had rows a moment ago is a red flag — roll back immediately.**

## Rollback (fast, non-destructive)

The policy carries no data; dropping it fully restores prior behavior.

```sql
do $$
declare t text;
  tables text[] := array[
    'users','organizations','customers','vendors',
    'orders','order_items','order_exceptions','order_splits','order_timeline',
    'imei_records','triage_results','shipments','vendor_bids',
    'notifications','notification_attempts','nps_responses',
    'recurring_trade_in_schedules','audit_logs','sla_breaches','sales_history'
  ];
begin
  foreach t in array tables loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop policy if exists tenant_isolation on %I', t);
  end loop;
end $$;
```

If a table also had RLS newly enabled for isolation and needs to revert:
`alter table <t> disable row level security;` (only for tables you enabled here —
do not disable RLS on tables that already had it for the existing role policies).

## Enabling enforcement on remaining tables (staged, optional)

The migration adds the policy everywhere but it only *enforces* where RLS is
already enabled. To extend isolation to a table that does not yet have RLS on,
enable it **one table at a time**, re-running the post-apply verification after
each:

```sql
alter table <table> enable row level security;
-- verify counts/list for that table's screens, then proceed to the next table
```

Do this during a low-traffic window. Stop and roll back that table the moment a
verification count drops.

## Sign-off checklist

- [ ] Pre-flight queries all pass
- [ ] Row counts captured before apply
- [ ] `supabase db push` applied
- [ ] `tenant_isolation` present on expected tables
- [ ] admin / customer / vendor logins load unchanged
- [ ] Row counts match pre-apply
- [ ] Rollback snippet saved and tested on staging (if available)
