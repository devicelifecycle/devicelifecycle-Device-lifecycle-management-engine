# DLM 2.0 — Remaining Build Plan

**Source spec:** `BB VAR Outline structure revised 2.0.docx`
**Scope:** everything still to build to finish the white-label multi-tenant VAR
platform. **Completed foundations are intentionally excluded** (listed once
below so the boundary is clear). This is the tracked plan — keep it updated as
phases land.

**Timeline:** 4 months (≈16 weeks). A 3.5-month compression is noted per phase.
**Status legend:** ☐ not started · ◐ in progress · ☑ done · ❓ needs product clarification

---

## ⚠ Critical findings — full audit against the source outline (2026-08-17)
Read `BB VAR Outline structure revised 2.0.docx` line-by-line (all 436 lines
extracted and verified against live code, not assumed) on 2026-08-17. Three
findings change scope enough to flag before more Month 3/4 work starts:

1. **White-label leak: transactional emails and PDFs are NOT tenant-branded.**
   `email.service.ts`, `pdf.ts`, and `rve-pdf.ts` all read
   `process.env.NEXT_PUBLIC_APP_NAME` — one global constant — not the
   recipient order's tenant branding. Every order confirmation, quote,
   password-reset, shipment-status email, and generated PDF says "Byte-Back"
   today regardless of which VAR the order belongs to. This directly
   contradicts the outline's guiding principle: *"An End Customer should never
   know they are using software owned by your company unless you
   intentionally expose that information."* **This is the single biggest
   white-label gap found — bigger than anything previously tracked.** New line
   item added to Month 1 below.
2. **Billing "Option A vs B" — the client's answer doesn't resolve it.** The
   outline (VAR Billing) frames Option A as *"VAR processes final bill or pays
   customer externally using their proprietary billing system"* — i.e. the VAR
   already bills the customer directly under Option A too, just outside our
   platform. Option B means Byte-Back builds in-platform invoicing FOR the
   VAR to bill their customer (invoices, payment collection, coupons, tax,
   outstanding-balance tracking — all end-customer-facing). The client's
   answer ("the reseller bills the end customer directly") is consistent with
   *either* option. **Needs one direct clarifying question before Month 3
   billing scope is locked** — see Open decisions.
3. **No granular permission-string RBAC model.** The outline's own "Enterprise
   Best Practices" section explicitly asks for `customer.create`,
   `user.delete`, `reports.view`-style permissions assignable to roles, not
   hardcoded role checks — and "Assign permissions" appears as a required
   capability at all three tiers (BB User Management, VAR User Management,
   Customer User Management). The live codebase has **none of this** — every
   route gates on a flat `role === 'admin'` (or similar) check. Roles work;
   granular per-user permission assignment does not exist anywhere. This is an
   architectural gap, not a small addition — flagged as its own line in
   Month 4 below rather than folded into existing "auth enforcement" bullet.

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
- ☑ **Per-tenant branding on outbound emails.** `resolveTenantBrandLabel()` (`src/lib/tenant-brand-label.ts`) added 2026-08-18, wired into `emailShell()` and the two customer-facing sends a VAR's own customer actually sees (order confirmation, shipment status). The other 7 email methods (welcome/password-reset/OTP/SLA-reminder/recurring-reminder — internal + account-security mail) and the two PDF generators (`pdf.ts`, `rve-pdf.ts`) still use the global `APP_NAME` — smaller follow-up, not the highest-value target. Completed 2026-08-23 — ALL 9 email methods now accept `tenantId` and resolve VAR branding (order-status, welcome, password-reset, OTP, password-change, SLA-reminder, recurring-reminder joined the original two); both PDF generators (`pdf.ts` order PDF + order-history PDF, `rve-pdf.ts`) take an optional `brandName` resolved from the record's tenant at all 4 call routes; every `[Byte-Back]` SMS literal (18 sites across notification/shipment/order/vendor/cron routes) now interpolates the resolved tenant brand. Callers thread `tenantId` from the record (order/user/profile), not the request host.
- ❓ **NEW: storage quota + AI-token metering per tenant.** Outline lists "Configure storage quotas" under BB Admin Platform Management and "Storage / API usage" under BB Admin Reporting. No metering exists today — `tenant-limits.ts` resolves `customers`/`users` quotas but has no `storage_mb` or `ai_tokens` counter. Groq (chat) and Supabase Storage usage is currently un-metered and un-capped per tenant.

*3.5-mo: keep RLS + proxy wiring; fast-track domain onboarding to Month 4.*

---

## Month 2 — Consoles (VAR Admin, delegated, End Customer)
*Un-pause and complete the three-tier consoles from the outline.*

- ◐ **VAR Admin console (backend):** delegated roles are now first-class (auth + routing); customer-management APIs shipped — `manage` (suspend/reactivate/assign/move), delegation-scoped export, chunked bulk import; search already existed. Console UI still paused.
- ☑ **VAR user & rep management** (add/disable reps, reset passwords, region assignment) — shipped 2026-08-18. `ALTER TYPE user_role ADD VALUE` migration applied to prod (dry-run verified first); `GET/POST /api/var/team` + `POST /api/var/team/[id]` (disable/reactivate/reset_password/reassign_region); new `canManageVarTeamMember`/`resolveTargetTenant` in `delegation.ts` (15 unit tests); UI at `/var/team`. "Create customer users" (a VAR provisioning a *login* for one of their own end customers, not a rep) is a smaller, distinct follow-up — not included in this pass.
- ☑ **Delegated N-level roles** enforcement (Appendix A: Entity → Regional Manager → Sales Rep scoping) wired into customer listings/export/management **and now team management**; roll-up reporting still to do — Roll-up reporting shipped 2026-08-23: pure aggregator `src/lib/var-rollup.ts` (7 unit tests, fixture typo fixed), scoped API `GET /api/var/reports` (entity/regional/rep scoping via delegation, region+rep filters, bounded fetches), UI `src/app/(dashboard)/var/reports/page.tsx` (by-rep + by-region tables, summary cards, unassigned-customer callout).
- ◐ **End Customer console:** company profile (backend + UI shipped 2026-08-17 — `customer_assets`/`company_profile` schema + APIs already existed from an earlier pass, only the page was missing), locations, departments, contacts, business hours — all in the shipped page
- ◐ Customer **device/asset register** (register/assign/retire/move/audit) + own reports/exports — register/assign/retire/move shipped 2026-08-17 (backend already existed). **Audit log + own reports/exports shipped 2026-08-23**: `customer_asset_events` migration (append-only, RLS, `registered/assigned/unassigned/retired/restored/moved/updated` check constraint), `GET /api/customer/assets/[id]/events` (tenant-scoped, 404s rather than leaks existence), a "History" dialog on each asset row, and `GET /api/customers/me/reports` + `/customer/reports` page (order/asset roll-up counters, recent-orders table, recent-assets table, reuses existing CSV/PDF export). *Found the base `GET/POST/PATCH /api/customer/assets` route file empty in the working tree — a prior session's file-write attempts had failed mid-edit and left behind five broken scratch scripts (`write_route.js`/`write_final.ps1`/etc.) instead of the real file; reconstructed it from the most complete draft, fixed a duplicated-return bug and a details-shape mismatch between the API and the History dialog's renderer, verified with `tsc` + a clean prod build, then deleted the scratch scripts.* **Bulk import for assets still isn't built** (API only accepts one asset at a time, unlike customers which has a bulk-import route).
- ☐ **NEW: per-customer license/plan assignment.** Outline lists "Assign licenses, Assign plans" under VAR Customer Management — read as per-customer, not per-tenant. Today licensing/plans resolve at the **tenant** level only (`tenant-limits.ts`); there is no way for a VAR to give one customer more seats/storage than another.
- ❓ **NEW: VAR-facing feature-flag toggle UI.** Outline's "VAR Product Configuration" lists "Enable features / Disable features" as a *VAR-level* capability (distinct from BB Admin's "Configure feature availability," which sets the ceiling). Feature-flag infrastructure exists (`features.ts`) but there is no VAR-facing UI to toggle which of their *allowed* features are actually turned on — `var/page.tsx` today is read-only (branding + margin + invoices, no toggles).
- ❓ **NEW: "archive" as a distinct customer state.** Outline separately lists "Suspend customers" and "Archive customers." Today there is only one binary `is_active` flag (suspend = deactivate); no distinct archived state. Confirm whether this is meant to be a real third state or just alternate wording for suspend before building anything.

> **Plan paused after M2.2 at user request (2026-08-07), resumed 2026-08-17.**
> Landed so far: M2.4 (Company Profile) ☑, M2.5 (Asset Register UI) ☑, M2.3
> (VAR rep management) ☑, M2.3b (roll-up reporting) ☑ 2026-08-23, customer-asset audit log + own reports/exports ☑ 2026-08-23.
> Next: asset bulk-import, then the two ❓ items above (per-customer licensing, VAR feature toggle) if prioritized.

*3.5-mo: ship VAR Admin + delegated roles; End Customer console trimmed to profile + reports.*

---

## Month 3 — Commerce depth (Billing, Pricing, RVE, Reporting)
*Complete the money-movement + reporting surfaces, then un-pause them.*

- ☐ **Billing reconciliation:** aggregate a period's orders → commission line items on invoices — **scope depends on the Billing Option A/B clarification, see Open decisions**
- ◐ **PO (Trade-In) vs Invoice (CPO)** flows; credits/refunds/payment history; tax on invoices; subscription-plan limit enforcement — `invoice_payments` table + RLS + `/api/admin/billing/[id]/payments` route already exist (found in the 2026-08-17 audit, migration dated 2026-08-13, comment tag "Wk10"); needs a UI pass to confirm it's fully wired
- ☐ **RVE productionization:** auto-scrape base value from the pricing engine, use the configured depreciation table/rate, make it a **sendable** residual-value quote
- ☐ **BB Admin reporting suite:** usage, storage, API usage, licenses, active/inactive, security/failed-logins (MRR/ARR already done)
- ☐ **Un-pause** Pricing, Commission, Plans, Billing, Reports, VARs, Platform Analytics + full QA
- ❓ **NEW: confirm commission is never itemized to the VAR.** Outline requires the platform commission and product margin to be "blended into the overall price... will NOT show up as a separate line item" — only visible in BB Admin reporting. Commission engine exists; **not yet directly verified** that generated VAR-facing quote/invoice PDFs never itemize BB's cut. Add to QA checklist before Month 3 sign-off.

*3.5-mo: billing reconciliation + RVE sendable are must-haves; defer deep BB reporting dashboards to launch buffer.*

---

## Month 4 — Security, integrations, support, launch
*Harden, integrate, and go live.*

- ☐ **Auth enforcement:** SSO, MFA (TOTP + enforced), IP allowlist enforcement (middleware), password-policy wiring
- ☐ **Granular permission-string RBAC** (`customer.create`, `user.delete`, `reports.view`, …) assignable per role/user — **NEW, own line per the 2026-08-17 audit** (see Critical findings #3). Currently every route hardcodes a role check; no permission-string model exists at all. This underlies "Assign permissions," which the outline lists as required at all three tiers (BB, VAR, Customer user management).
- ☐ **Secure impersonation:** session-swap + persistent UI banner (built on the R9 audit log) — the audit LOG exists; the actual impersonate-as-user flow (BB Admin → any VAR/customer, per the outline's "BB Admin Support" list) does not
- ☐ **Integrations:** API keys + public API (data model exists, admin-only today — outline lists API keys as **both** a BB Admin *and* a VAR-level self-service capability, needs a VAR-facing UI), SMS/SMTP config UIs (outline places these under **BB Admin Platform Management**, not VAR settings — read as Byte-Back staff configuring each VAR's sender identity from an admin panel, not VAR self-service; confirm), payment gateway
- ☐ **White-label depth:** email/notification templates wired into live sends (blocked on the Month-1 per-tenant-branding email fix above), custom login page, KB links, privacy policy, **logo image upload** (today the branding editor only has a 6-character text monogram (`logoText`) — no image upload UI, despite `TenantBranding.logoUrl` existing as a type), **secondary brand color field** (only `primary`/`sidebarBg`/`primaryForeground` exist — outline separately lists "Primary color" and "Secondary color"), **support phone field** (`supportEmail` exists on `TenantBranding`, `supportPhone` does not)
- ☐ **Support depth:** knowledge base, chat, escalation, ticket SLAs
- ☐ Vendor auction / quote-to-vendor (open question in the outline — confirm scope). **Client answer 2026-08-17: not initially, discuss complexity for the future.** Complexity note for that discussion: single-tenant vendor bidding already works today (Byte-Back's own CPO vendor pool); making it *per-VAR* (each VAR's own private vendor pool, one VAR's vendors never seeing another VAR's deals) needs vendor records to become tenant-scoped, which they are not today — a real but bounded lift, not a rebuild.
- ☐ **Launch:** full QA, data migration, staged rollout, un-pause all remaining *Coming Soon* features
- ❓ **NEW: "Restart services" (BB Admin Support) doesn't map to a serverless architecture.** The platform runs on Vercel (no persistent server process to restart). Needs clarification on actual intent — redeploy? clear a specific cache? restart a background/cron job?
- ❓ **NEW: "Encryption keys" (BB Admin Security) — app-layer feature or infra-level (Supabase-managed)?** Not clearly an application feature to build; likely already handled at the infrastructure layer. Confirm before scoping.
- ❓ **NEW: data retention policies** (BB Admin Security lists this explicitly) — no scheduled data-retention/deletion policy exists anywhere in the codebase today.

*3.5-mo: auth enforcement + impersonation + launch are fixed; API/public-API and vendor auction move to a post-launch fast-follow.*

---

## Full source-outline audit (every section, 2026-08-17)
Every section of `BB VAR Outline structure revised 2.0.docx`, checked against
the live codebase line by line. Anything not called out here matches the plan
above with no new finding. ✅ built · ◐ partial · ☐ not built · ❓ needs clarification

**Platform look & feel** — ✅ white background / blue-on-blue Byte-Back mark (light-mode login fix + rebrand, shipped).

**Guiding principle** (Admin controls platform / VAR controls own business / End Customer controls own company / VARs invisible to each other) — ✅ tenant isolation + RLS. **Exception: ☐ the email/PDF branding leak in Critical findings #1** — this principle is violated today for every outbound email and PDF.

**Revenue model** (platform commission % + product margin %, admin-adjustable input fields, blended not itemized, BB-only reporting split) — ✅ commission engine + reporting shipped; ❓ deal-by-deal per-order adjustment vs. tenant-default only — not directly verified; **☐ QA item added to Month 3** to confirm PDFs never itemize BB's cut.

**VAR revenue model** (Corp Tab / Rep Tab margin input fields) — ✅ `corpMargin`/`repMargin` exist in the commission config (`MarginSpec`, seen in `var/page.tsx`).

**1. Platform Admin** —
- Create/Edit/Delete/Suspend/Activate VARs — ✅ `admin/tenants` CRUD page exists.
- Set white-label domains — ◐ operational via runbook, not a one-click admin UI field.
- Configure branding — ◐ exists but limited (see logo/secondary-color gaps in Month 4).
- Configure licensing / subscription plans — ✅ `admin/plans`.
- Configure storage quotas — ☐ (Month 1 new item).
- Configure feature availability — ✅ ceiling exists (`features.ts`); ❓ VAR-facing toggle within that ceiling (Month 2 new item).
- Configure API integrations / SMTP / SMS / payment gateways — ☐ (Month 4).
- **BB User Management "is this role different from Platform Management? Can we combine both?"** — this was an open question **in the source doc itself**, not from the client. Current build already resolves it: one `admin` role does both. No action needed unless you want them split.
  - Create Admins / Create VAR Administrators — ❓ platform admin can create another platform admin via the existing user UI; **cannot yet create a `var_entity_admin`** through any UI — the invite-VAR-admin console is the same Month 2 dependency already tracked, confirmed still missing.
  - Reset passwords / Lock accounts / Delete users — ✅.
  - Assign permissions — ☐ blocked on the RBAC gap (Critical finding #3).
  - View login history — ❓ `audit_logs` exist; a dedicated login-history view not directly confirmed.

**BB Customer Management / Model** (VARs = Telco Reps, Distributors like TD Synnex, Resellers like Evergreen; BB's own direct customers sit under a "BB VAR" category) — ✅ matches the platform-tenant (`PLATFORM_TENANT_ID`) design already built.

**BB Admin Platform "View ALL"** (VARs, Customers, Devices, Tickets, Reports, Billing, Pricing, Audit Logs, Activity) — ✅ all present in the admin nav.

**BB Admin Pricing** (pricing tables, deal-by-deal override, depreciation table for RVE, communicate pricing discrepancies to VAR) — ✅ pricing admin + RVE depreciation table exist; ◐ discrepancy notice exists **per-order** (`notify-price-change`), not as a VAR-wide "pricing table changed" broadcast — different granularity than the outline implies, worth a quick confirm.

**BB Admin Billing** (invoice VARs, manage subscriptions, credits/reconciliation, payment history, refunds, taxation, revenue + commission/holdback reports) — ✅ mostly shipped; ◐ `invoice_payments` (payments + refunds) exists at the schema+API level (found in this audit) but needs a UI confirmation pass; ☐ the reconciliation step itself (period → invoice line items) is the real remaining gap, already tracked in Month 3.

**BB Admin Reporting** (Global/Revenue/MRR/ARR/Active-Inactive/Devices/Usage/Storage/API usage/Licenses/Security/Failed logins) — verbatim match to the Month 3 "BB Admin reporting suite" line already tracked; only MRR/ARR done.

**BB Admin Support** (impersonate VAR/customer, reset accounts, force password reset, view/export logs, restart services) — ◐ logs exist; ☐ impersonation UI (Month 4); ❓ "restart services" (Month 4 new item).

**BB Admin Security** (roles, permissions, SSO, MFA, API keys, encryption keys, audit logs, IP restrictions, password policy, retention policies) — ◐ roles/audit/password-policy/IP shipped; ☐ SSO, MFA, granular permissions, retention policies; ❓ encryption keys (Month 4 new item).

**2. VAR Administrator** ("should feel like they own the software," never see another VAR, everything tenant-limited) — ✅ matches tenant isolation exactly.

**VAR White-Label Settings** — logo upload ☐ (text monogram only, no image); Corp/Rep margin ✅; company name ✅; primary color ✅; secondary color ☐ (field doesn't exist); login page ☐; email/notification templates ☐ (blocked on Critical finding #1); support email ✅ (`TenantBranding.supportEmail`); support phone ☐ (no field); KB links ☐; custom domain ✅ (operational); privacy policy ☐.

**VAR Customer Management** — create/suspend/move/search/bulk-import/bulk-export ✅; assign licenses/plans **per customer** ☐ (Month 2 new item, tenant-level only today); archive as a distinct state ❓ (Month 2 new item); automated reminders under VAR letterhead — ◐ the reminder email exists (`sendRecurringTradeInReminderEmail`) but **inherits the same Critical finding #1 branding leak** — it goes out under Byte-Back branding today regardless of the VAR.

**VAR User Management** (create customer users/admins, disable, reset passwords, force MFA, assign permissions, add/disable reps) — this **is** M2.3, in progress now; MFA piece is blocked on Month 4 auth work.

**VAR Billing** — see Critical finding #2 (Option A/B ambiguity, needs one clarifying question).

**VAR Reporting** (roll-up of all reps, view by rep/region, manage commissions) — this **is** M2.3b, next after M2.3.

**VAR Product Configuration** (enable/disable features, API keys, custom workflows, automation, alerts, notification settings) — ❓ feature toggle (Month 2 new item); ☐ VAR-facing API keys (Month 4); ☐ custom workflows/automation (not scoped anywhere yet — flag for a future phase, out of the current 4-month window unless reprioritized); ◐ alerts exist internally (SLA) but not VAR-configurable; notification settings exist per-user, not per-VAR-tenant broadly.

**VAR Support** (tickets ✅; KB ☐; live chat ☐ — the existing `ChatAssistant` is an AI assistant, not human live chat, worth clarifying with the client which one they mean).

**VAR Security** (customer audit logs / login history — ◐ infra exists, scoped view not confirmed; API tokens ☐; customer SSO ☐; password policy "within allowed limits" — ◐ currently BB/admin-set, not clear if VARs can self-adjust within bounds).

**VAR Restrictions** (cannot see other VARs / global revenue / alter BB pricing / change licensing or platform settings / delete platform data / manage admin users / modify billing or integrations engines) — ✅ believed enforced throughout by role checks; every admin-only route read during this audit gates strictly on `role === 'admin'`.

**Multi-level VAR flexibility note + Appendix A** (both worked examples: 3-tier "Sales Co." and 5-tier "Bell") — ✅ **confirmed the current 3-role delegation model (`var_entity_admin` → `var_regional_manager` → `var_sales_rep`) already satisfies both given examples** — the shallower example simply doesn't use the regional tier. The outline's "need flexibility for more levels" is framed as a future ask, not required for either worked example.

**3. End Customer** — dashboard (usage/devices/reports/alerts/notifications/storage/licenses) — ◐ an orders-focused dashboard exists; the broader usage/storage/license view does not yet (depends on Month 1 metering work).

**Customer User Management** (create/disable users, reset passwords, assign permissions, invite, delete) — ✅ already works via the existing org-admin pattern (`/customer/team`).

**Customer Company Settings** (profile, locations, departments, contacts, hours, notifications) — ✅ shipped 2026-08-17 (this session); notifications piece is the pre-existing separate per-user preference system, not part of `company_profile` — same end result, different field.

**Customer Data Management** (import/export/search/reports/history) — ◐ order-level import/export/search exist; asset change history ✅ shipped 2026-08-23; ☐ no bulk import for the *asset* register specifically (API is single-row only).

**Customer Devices/Assets** (register/assign/retire/move/audit/track) — ✅ shipped, "audit" (change-history log) landed 2026-08-23.

**Customer Reports** (operational/compliance/inventory/financial/user-activity/device-history/exports) — ◐ order + asset roll-up counters, order history table, recent-assets table, and CSV/PDF export shipped 2026-08-23 (`/customer/reports`); no dedicated compliance/financial report types beyond that.

**Customer Support** (tickets ✅; KB ☐; chat ☐ — same live-chat-vs-AI-assistant clarification as VAR Support above).

**Customer Security** (MFA ☐; password changes ✅; API tokens ☐; own audit log ❓ not confirmed customer-facing; IP restrictions — not customer-facing by design; SSO if licensed ☐).

**Customer Restrictions** — ✅ believed enforced architecturally (tenant + org scoping throughout); no new gap found.

**Permission Matrix** (the full Platform Admin / VAR Admin / Customer Admin table) — kept as the reference target; fully realizing it row-by-row requires the RBAC permission-string model (Critical finding #3) — right now enforcement is coarser (role-level, not the fine per-function grid the matrix describes).

**Enterprise Best Practices** (7 recommendations) — RBAC granular ☐; multi-tenant ✅; feature flags ◐ (infra yes, VAR self-toggle no); audit logging ✅; delegated administration ◐ (roles yes, self-service rep creation in progress); secure impersonation ◐ (log yes, UI no); scalable licensing ◐ (customers/users yes, storage/API/transactions no).

---

## Cross-cutting (every phase)
- gstack workflow: small self-verifying commits, build→test→fix loop, keep the tree green
- Keep it **additive**; each change verified with `tsc` + vitest (baseline unchanged) + production build for risky/page work
- Update this doc's checkboxes as phases land; keep [[BB_VAR_GAP_MAP]] in sync

## Open decisions (need product input)
- ~~Vendor auction in-platform?~~ **Answered 2026-08-17: not initially — revisit complexity for a future phase.** See Month 4 note for the complexity read.
- Custom domains vs subdomains per VAR — pros/cons written up and sent to client 2026-08-17 (Telus example); awaiting their choice per-VAR (can be mixed — doesn't need to be all-or-nothing).
- **Billing Option A vs B — client's answer doesn't fully resolve this (see Critical finding #2).** Exact clarifying question to send: *"Do you want resellers billing their customers entirely outside our platform using their own system (Option A — little new billing UI needed), or do you want Byte-Back to build them in-platform invoicing tools — invoices, payment collection, coupons, tax, outstanding-balance tracking — to bill their own customers (Option B — a real new subsystem)?"*
- Tax model confirmation (province table shipped) — outstanding.
- Payment gateway choice — **client deferred to the face-to-face (Weeks 9–12 discussion).**
- **NEW: SMTP/SMS/payment-gateway configuration — who configures it?** Outline places this under BB Admin, not VAR settings, suggesting Byte-Back staff sets a VAR's sender identity from an admin panel rather than the VAR self-configuring provider credentials. Confirm with client — changes whether Month 4's "Integrations: SMS/SMTP config UIs" needs a VAR-facing UI at all, or only a BB-admin one.
- **NEW: "live chat" — human support chat, or is the existing AI ChatAssistant sufficient?** The outline lists "Chat" under both VAR Support and Customer Support. An AI assistant already exists; a human-staffed live-chat widget does not. Confirm which one (or both) is meant before scoping Month 4 support depth.
- **NEW: "Archive customers" as a distinct state from "Suspend customers"** — confirm if this needs its own status or is just alternate wording (Month 2 finding).
- **NEW: per-order commission adjustment** — confirm whether admin needs to override the commission % per individual deal, or a tenant-wide default is sufficient (Revenue Model section finding).
