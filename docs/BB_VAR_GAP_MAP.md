# BB VAR Outline 2.0 — Line-by-line Gap Map

Every feature area from `BB VAR Outline structure revised 2.0.docx` mapped to its
status. **Done** = built + tested. **Partial** = foundation exists, more UI/wiring
to come. **Planned** = tracked, additive, not yet built. Nothing here changes the
current single-tenant flow (all existing data lives on the Byte-Back platform tenant).

## Look & feel
| Line | Status | Where |
|---|---|---|
| White bg / black text / blue headings, blue-on-blue logo | ✅ Done | `globals.css`, `ByteBackMark`, landing |
| White-label, hierarchical control, strict tenant isolation | ✅ Done | `tenants`, tenant_id, `tenant_isolation` RLS |
| VAR never sees other VARs; customer never sees BB | ✅ Done (data) | RLS + role gating |

## BB revenue model
| Line | Status | Where |
|---|---|---|
| Platform Commission % added to market value | ✅ Done | `commission.ts` `platformCommissionPct` |
| Admin "Input tab" to set commission, adjust deal-by-deal | ✅ Done | `/admin/commission` |
| Blended into price, NOT a VAR line item | ✅ Done | `computeDealPricing` `varPrice` |
| BB Admin reporting separates commission | ✅ Done | `commission-report.ts`, `/admin/reports/commission` |
| Product Margin % "Input tab", blended, reported separately | ✅ Done | `productMarginPct`, report |
| Holdback model + commission/holdback reports | ✅ Done | `commission.ts` `holdbackPct`, report |
| Trade-in / CPO worked examples ($110→$102, $1,020→$1,100) | ✅ Done | `commission.test.ts` |
| RVE (Residual Value Estimate) via depreciation table | ✅ Done | `rve.ts` + tests |

## VAR revenue model
| Corp Tab margin, Rep Tab margin | ✅ Done | `corpMargin`, `repMargin` |

## 1. Platform Admin (BB)
| Line | Status | Where |
|---|---|---|
| Create/Edit VARs, Suspend/Activate | ✅ Done | `/admin/tenants`, `is_active` |
| Delete VARs | ⏳ Planned | (soft-delete preferred; suspend covers it) |
| White-label domains, branding | ✅ Done | tenant detail editor |
| Licensing, subscription plans, storage quotas | ✅ Done (model) | `licensing.ts`, `tenants.settings.license` |
| Feature availability (feature flags) | ✅ Done | `features.ts` + per-VAR toggle |
| API integrations, SMTP, SMS, payment gateways, global settings | 🟡 Partial | email/SMS exist; gateways Planned |
| BB User Mgmt (admins, VAR admins, reset pw, lock, delete, perms) | 🟡 Partial | users admin exists; MFA/lock Planned |
| Force MFA, view login history | ⏳ Planned | `security_events` (audit) |
| View ALL: VARs/Customers/Devices/Reports/Billing/Pricing/Audit/Activity | 🟡 Partial | most admin views exist; Tickets Planned |
| Tickets (support) | ⏳ Planned | support module |
| BB Admin Pricing (tables, set-pricing discretion, discrepancies) | ✅ Done (existing) | `/admin/pricing` |
| Depreciation table for RVE | ✅ Done | `rve.ts` (default table + config) |
| BB Admin Billing: invoice VARs (CPO) / issue POs (Trade-in) | ✅ Done | `/admin/billing`, invoice `kind` |
| Subscriptions, credits, refunds, taxation, holdback reports | 🟡 Partial | invoices + holdback report; payments Planned |
| BB Admin Reporting: Revenue/MRR/ARR/active/devices/usage/storage/API/licenses/security | 🟡 Partial | commission report; MRR/ARR Planned |
| BB Admin Support: impersonate VAR/customer (logged) | ⏳ Planned | `impersonation_log` (risky to auth; phased) |
| BB Admin Security: Roles/Permissions/SSO/MFA/API keys/encryption/audit/IP/password/retention | 🟡 Partial | RBAC done; SSO/MFA/IP Planned |

## 2. VAR Administrator
| Line | Status | Where |
|---|---|---|
| White-label settings (logo, name, colors, support, domain, templates, KB, privacy) | 🟡 Partial | branding editor; outbound email/PDF/SMS tenant-branded 2026-08-23; templates/KB Planned |
| Set Commission/Margin/Holdback model (Input Tab) | ✅ Done | VAR margin self-service |
| Customer Mgmt (create/suspend/delete/assign/move/archive/search/bulk/reminders) | 🟡 Partial | VAR console UI `/var/customers` (search/filters/suspend/reactivate/assign_plan/region move/bulk import/export) ✅ 2026-08-23; per-customer license/plan assignment ✅ 2026-08-23 (`customers.plan_id` FK, `customer-limits.ts`, `assign_plan` action); archive question resolved-documented 2026-08-23 (suspend covers all archive semantics; quota counts now filter is_active); reminders under VAR letterhead Planned |
| VAR User Mgmt (customer users, reps, disable, reset, perms) | ⏳ Planned | delegated roles |
| Add/disable reps | ✅ Done (roles) | delegated `var_*` roles seed |
| VAR Billing (Option A: BB bills/pays VAR; Option B future) | ✅ Done (A) | VAR console invoices |
| VAR Reporting (revenue/count/growth/MRR/roll-up by rep/region) | ✅ Done | margin model view + roll-up by rep/region (`src/lib/var-rollup.ts`, `GET /api/var/reports`, `/var/reports` UI) shipped 2026-08-23 |
| VAR Product Config (features/API/workflows/automation/alerts) | ✅ Done (features) | per-VAR feature flags + VAR-facing toggle UI `/var/features` (ceiling-respecting, `applyVarToggles` wired into tenantLimits) shipped 2026-08-23 |
| VAR Support (tickets/KB/chat) | ⏳ Planned | support module |
| VAR Security (audit/login/API tokens/SSO/password) | 🟡 Partial | audit exists; SSO Planned |
| VAR Restrictions (cannot see other VARs / global rev / alter BB pricing …) | ✅ Done | RLS + `permission-matrix.ts` |

## 3. End Customer
| Dashboard/UserMgmt/CompanySettings/Data/Devices/Reports/Support/Security/Restrictions | 🟡 Partial | existing customer role covers core; company settings Planned; asset AUDIT history ✅ 2026-08-23 (`customer_asset_events` + lazy History dialog); asset BULK IMPORT ✅ 2026-08-23 (`/api/customer/assets/bulk`: validation, dup detection, 500-row cap, failure CSV); own Reports page ✅ 2026-08-23 (`/customer/reports` + counters API + PDF/CSV exports) |

## Enterprise Best Practices (explicitly recommended)
| RBAC (permission-based, new roles without code) | ✅ Done | `permissions.ts`, RBAC tables |
| Multi-tenant (tenant_id on every record, auto isolation) | ✅ Done | core migration + RLS |
| Feature flags (global or per-VAR plan) | ✅ Done | `features.ts` |
| Comprehensive audit logging | 🟡 Partial | `audit_logs` exists |
| Delegated administration (VAR sub-roles ≤ granted) | ✅ Done (model) | delegated roles + `parent_role_id` |
| Secure impersonation (logged, UI-indicated) | ⏳ Planned | phased (auth-sensitive) |
| Scalable licensing (customers/users/storage/API/transactions) | ✅ Done | `licensing.ts` |

## Appendix A — N-level hierarchy
| Program Admin → VAR Entity → Regional Mgr → Sales Rep → Customer (≤5 levels) | ✅ Done (model) | `tenants.parent_tenant_id` + delegated role levels |
