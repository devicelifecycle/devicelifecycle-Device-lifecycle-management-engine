# VAR Platform — Launch Runbook

Go-live steps for the white-label multi-tenant (VAR) re-architecture. Every
change is **additive**: on a fresh apply the system behaves exactly as the
current single-tenant app, because all existing rows and users live on the
Byte-Back platform tenant (`a0000000-0000-4000-a000-0000000000bb`).

## 1. Migrations (apply in order)

`supabase db push` applies these in timestamp order:

| Migration | Effect |
|---|---|
| `20260729000000_multitenant_core.sql` | `tenants` table + Byte-Back seed; `tenant_id` (DEFAULT platform) on 20 tables; `auth_tenant_id()`. |
| `20260731000000_rbac_foundation.sql` | permissions / roles / role_permissions / user_roles mirroring the 6 current roles. |
| `20260801000000_tenant_isolation_rls.sql` | RESTRICTIVE `tenant_isolation` policy on the 20 tenant tables (narrows only; no-op today). |
| `20260802000000_billing.sql` | `invoices` + `invoice_line_items` (+ atomic `next_invoice_seq`), RLS. |

All are idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`) and safe to
re-run. `tenant_id` uses a Postgres fast-default, so the backfill is instant
even on large tables.

## 2. Post-apply verification

Run `supabase/verify/tenant_isolation_check.sql` (below) against the DB. Expect:
- The Byte-Back platform tenant exists and is `type='platform'`.
- Every backfilled table reports `0` rows with a NULL `tenant_id`.
- `tenant_isolation` policy is present and `RESTRICTIVE` on all 20 tables.
- A platform user still sees all platform rows (behavior unchanged).

## 3. Onboarding a VAR (BB Admin)

1. **VARs → Create VAR** (`/admin/tenants`): name + slug → new `type='var'` row.
2. **Open the VAR → Branding** (`/admin/tenants/[id]`): name, monogram, primary
   / sidebar HSL, tagline, support email, custom domain, active toggle.
3. **Commission** (`/admin/commission`): platform commission %, product margin %,
   and the VAR's corp/rep margins (stored on `tenants.settings.commission`).
4. **Billing** (`/admin/billing`): create draft invoices per period; the VAR
   sees them in its console (`/var`).

## 4. White-label DNS + email (per VAR, user-side)

- **Custom domain**: point the VAR's `portal.<domain>` CNAME at the app host;
  set `custom_domain` on the tenant. (Runtime domain→tenant resolution is the
  remaining wiring — branding + storage are in place.)
- **Email**: verify the sending domain in Resend; set the VAR support address in
  branding. Byte-Back's own DNS: `A @ 76.76.21.21` for byte-back.ca.

## 5. Rollback

Isolation is restrictive-only, so the fastest revert without dropping data is to
disable the added policy per table:

```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;      -- or, more surgically:
DROP POLICY IF EXISTS tenant_isolation ON orders;   -- repeat per table
```

The new tables (`invoices`, `tenants`, RBAC) are unreferenced by existing flows;
leaving them in place has no effect on the current app.

## 6. Scale / operations notes

- **Pagination**: all list endpoints use `src/lib/paging.ts` (default 50, max
  200) with `.range()` — no fetch-all.
- **Indexes**: `tenant_id` on every scoped table; `invoices(tenant_id)`,
  `invoices(status)`, `invoice_line_items(invoice_id)`.
- **RLS cost**: `auth_tenant_id()` is `STABLE` — evaluated once per statement,
  not per row.
- **Invoice numbering**: atomic `next_invoice_seq()` (row-locked upsert) — safe
  under concurrent creation.
- **Reporting**: `projectVolume()` is O(1) and scales to millions of deals
  without materializing arrays.
