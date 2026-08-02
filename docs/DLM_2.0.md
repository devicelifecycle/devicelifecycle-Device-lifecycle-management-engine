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

- ☐ Wire `resolveTenantIdByHost` into the proxy/middleware → per-request tenant context
- ☐ Runtime **per-tenant branding/theme** injection (custom domain + `<slug>.base` subdomain)
- ☐ **Apply + verify tenant-scoped RLS** across all 20 tables (migration exists) on staging, with a rollback runbook
- ☐ VAR provisioning end-to-end: create VAR → invite users → data scoped to tenant
- ☐ Enforce **feature flags** on module routes + **quota** on the remaining create paths (users/storage/API/transactions)
- ☐ Custom-domain onboarding (GoDaddy DNS + Resend domain verification)

*3.5-mo: keep RLS + proxy wiring; fast-track domain onboarding to Month 4.*

---

## Month 2 — Consoles (VAR Admin, delegated, End Customer)
*Un-pause and complete the three-tier consoles from the outline.*

- ☐ **VAR Admin console:** tenant-scoped customer management (create/suspend/delete/assign/move/archive/search/bulk import-export/automated reminders)
- ☐ VAR **user & rep** management (create customer users, add/disable reps, reset passwords, assign permissions)
- ☐ **Delegated N-level roles** enforcement (Appendix A: Entity → Regional Manager → Sales Rep scoping + roll-up reporting)
- ☐ **End Customer console:** company profile, locations, departments, contacts, business hours
- ☐ Customer **device/asset register** (register/assign/retire/move/audit) + own reports/exports

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
