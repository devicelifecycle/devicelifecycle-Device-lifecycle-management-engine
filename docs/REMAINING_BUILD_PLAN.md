# Remaining VAR-Platform Build Plan

Everything below is **additive** (no change to current single-tenant behavior),
**tested** (pure logic gets unit tests; each phase runs tsc + full suite), and
**committed locally only** — the whole batch is pushed at once when complete.
Risky architectural wiring (runtime tenant/domain resolution) is sequenced LAST
and defaults to the platform tenant so it can't destabilize what already works.

## Sequence

**R1 — Subscription plans + billing operations**
- `subscription_plans` table (name, slug, monthly_price, currency, limits, features, is_active) + seed Starter/Growth/Enterprise.
- Plan resolver lib + tests. Tenant ↔ plan via existing `tenants.plan`.
- Admin plans API + screen; invoice status transitions (draft→sent→paid/void) + credits/adjustments; PO (trade-in) vs invoice (CPO) kind.

**R2 — Platform analytics / reporting**
- `platform-metrics.ts`: MRR/ARR (from active plans), active/inactive tenants & customers, order/device/revenue rollups — pure + tests.
- `/api/admin/reports/platform` (admin, aggregated) + dashboard page.

**R3 — Support ticketing**
- `tickets` + `ticket_messages` (tenant-scoped, RLS). API + admin/VAR/customer views. Status machine + tests.

**R4 — Delegated VAR admin + tenant-scoped customer management**
- Role-assignment API/UI (assign users to var_entity_admin / var_regional_manager / var_sales_rep). Add/disable reps.
- VAR-scoped customer list view.

**R5 — White-label depth**
- Per-VAR email/notification templates + KB links + privacy policy in `tenants.settings`; template resolver + tests; wire into email service fallback.

**R6 — Quota enforcement + feature gating**
- Wire `licensing.ts` quota checks into create paths (customers/users); `features.ts` gating helpers for module routes. Tests.

**R7 — Auth/security config**
- Password policy, MFA-required flag, IP allowlist stored per tenant (config + resolver + tests). Enforcement optional/flagged.

**R8 — Runtime tenant/domain resolution (ISOLATED)**
- Resolver: custom domain / subdomain → tenant, defaulting to the platform tenant. Behind a flag; branding applied per resolved tenant. No change when unresolved.

**R9 — Secure impersonation (logged)**
- `impersonation_log` + admin-only start/stop with a visible banner. Auth-sensitive; last.

## Status
- [x] R1 (done in prior phases)  [x] R2 (done)  [x] R3 (tickets + SLA)  [x] R4 (VAR admin done)
- [x] R5 (white-label depth)  [x] R6 (quota/feature gating done)  [x] R7 (auth config)  [ ] R8 (runtime domain resolution — optional)  [x] R9 (impersonation)

> See `docs/M4_COMPLETION.md` for the full Month-4 completion record (impersonation,
> RBAC, API keys, comms/sender config, KB, ticket SLAs, auth enforcement).
