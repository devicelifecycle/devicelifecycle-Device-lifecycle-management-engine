# DLM 2.0 — Remaining Build Plan

**Source spec:** `BB VAR Outline structure revised 2.0.docx`
**Scope:** everything still to build to finish the white-label multi-tenant VAR
platform. **Completed foundations are intentionally excluded** (listed once
below so the boundary is clear). This is the tracked plan — keep it updated as
phases land.

**Timeline:** 4 months (≈16 weeks). A 3.5-month compression is noted per phase.
**Status legend:** ☐ not started · ◐ in progress · ☑ done

---

## Already shipped — OUT OF SCOPE (do not re-plan)
Foundations, engines, APIs, migrations, and tests that are already built,
verified, and on `main` (frontend currently behind *Coming Soon*):

- Multi-tenant core (`tenants`, `tenant_id`, tenant-aware auth) + tenant-isolation RLS **migration authored**
- RBAC (permissions/roles/user_roles) + delegated VAR role templates (Appendix A)
- Commission engine (platform commission + product margin + holdback) + commission reporting (O(1))
- White-label **branding** resolver + editor; per-VAR feature flags; licensing/quota model
- Billing: invoices + atomic numbering + subscription plans + status transitions + credits
- Platform analytics (MRR/ARR/counts); Support ticketing; RVE engine + admin quote calculator
- Canadian tax engine; per-tenant **security config** (password/MFA/IP); host→tenant **resolver** lib; **impersonation audit log**
- Blue rebrand + landing; order-flow fixes (storage in review, edit-quote add-item+notes, CPO grade, CAD/USD)

> These are done. The plan below is **only the remaining wiring, depth, and net-new work.**

---

## Month 1 — Make tenancy real (runtime isolation)
*Turn the built foundations into a live multi-tenant system.*

- ☑ Per-request tenant context via `getServerTenant()` (server-side, React-cached; platform host = no-DB fast path)
- ☑ Runtime **per-tenant branding/theme** injection in the root layout (`tenantBrandingStyle`, `:root:root` both themes; no-op for platform)
- ◐ **Apply + verify tenant-scoped RLS** — migration authored + safe-by-construction; apply/verify/rollback runbook at [[DLM_2.0_RLS_Runbook]]; **awaiting go-ahead to run `db push` on prod**
- ◐ VAR provisioning: **data-scoping done** (creator's tenant stamped on users/customers/orders via `nonPlatformTenantId`); invite console + `var_*` role system is a Month 2 dependency
- ☑ Enforce **feature flags** on module routes + **quota** on create paths (customers/users/transactions); API-call metering + storage deferred (runtime metering / no file-size source)
- ◐ Custom-domain onboarding — resolver + runtime branding already support subdomains + custom domains; operational checklist at [[DLM_2.0_Custom_Domain_Onboarding]] (DNS + Vercel + Resend). Per-VAR lighting-up is operational, done at launch.

*3.5-mo: keep RLS + proxy wiring; fast-track domain onboarding to Month 4.*

---

## Month 2 — Consoles (VAR Admin, delegated, End Customer)
*Un-pause and complete the three-tier consoles from the outline.*

- ◐ **VAR Admin console (backend):** delegated roles are now first-class (auth + routing); customer-management APIs shipped — `manage` (suspend/reactivate/assign/move), delegation-scoped export, chunked bulk import; search already existed. Console UI still paused.
- ☐ VAR **user & rep** management (create customer users, add/disable reps, reset passwords, assign permissions)
- ☑ **Delegated N-level roles** enforcement (Appendix A: Entity → Regional Manager → Sales Rep scoping) wired into customer listings/export/management; roll-up reporting still to do
- ☐ **End Customer console:** company profile, locations, departments, contacts, business hours
- ☐ Customer **device/asset register** (register/assign/retire/move/audit) + own reports/exports

> **Plan paused after M2.2 at user request (2026-08-07).** Remaining Month 2:
> VAR user/rep management (M2.3), End Customer console (M2.4), asset register
> (M2.5), roll-up reporting. Foundation (roles, RLS, delegation, tenant scoping)
> is in place to resume from.

*3.5-mo: ship VAR Admin + delegated roles; End Customer console trimmed to profile + reports.*

---

## Month 3 — Commerce depth (Billing, Pricing, RVE, Reporting)
*Complete the money-movement + reporting surfaces, then un-pause them.*

- ☐ **Billing reconciliation:** aggregate a period's orders → commission line items on invoices
- ☐ **PO (Trade-In) vs Invoice (CPO)** flows; credits/refunds/payment history; tax on invoices; subscription-plan limit enforcement
- ☐ **RVE productionization:** auto-scrape base value from the pricing engine, use the configured depreciation table/rate, make it a **sendable** residual-value quote
- ☐ **BB Admin reporting suite:** usage, storage, API usage, licenses, active/inactive, security/failed-logins (MRR/ARR already done)
- ☐ **Un-pause** Pricing, Commission, Plans, Billing, Reports, VARs, Platform Analytics + full QA

*3.5-mo: billing reconciliation + RVE sendable are must-haves; defer deep BB reporting dashboards to launch buffer.*

---

## Month 4 — Security, integrations, support, launch
*Harden, integrate, and go live.*

- ☐ **Auth enforcement:** SSO, MFA (TOTP + enforced), IP allowlist enforcement (middleware), password-policy wiring
- ☐ **Secure impersonation:** session-swap + persistent UI banner (built on the R9 audit log)
- ☐ **Integrations:** API keys + public API, SMS/SMTP config UIs, payment gateway
- ☐ **White-label depth:** email/notification templates wired into live sends, custom login page, KB links, privacy policy
- ☐ **Support depth:** knowledge base, chat, escalation, ticket SLAs
- ☐ Vendor auction / quote-to-vendor (open question in the outline — confirm scope)
- ☐ **Launch:** full QA, data migration, staged rollout, un-pause all remaining *Coming Soon* features

*3.5-mo: auth enforcement + impersonation + launch are fixed; API/public-API and vendor auction move to a post-launch fast-follow.*

---

## Cross-cutting (every phase)
- gstack workflow: small self-verifying commits, build→test→fix loop, keep the tree green
- Keep it **additive**; each change verified with `tsc` + vitest (baseline unchanged) + production build for risky/page work
- Update this doc's checkboxes as phases land; keep [[BB_VAR_GAP_MAP]] in sync

## Open decisions (need product input)
- Vendor auction in-platform? · Custom domains vs subdomains per VAR · Billing Option A (BB↔VAR) vs Option B (VAR→customer direct) · Tax model confirmation (province table shipped) · Payment gateway choice
