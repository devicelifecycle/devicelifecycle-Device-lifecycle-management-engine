# Month 4 — Build Completion (White-Label Depth, Security, Support, Launch)

All work below is additive, local-only (not pushed), and verified with
`tsc --noEmit` (0 errors) + `next build` (passes). Test suite remains at the
pre-existing allowlist baseline (~100 known failures / ~1550 passing) — no new
regressions.

## Database migrations added (apply with `supabase db push` / `supabase migration up`)
- `supabase/migrations/20260801000000_api_keys.sql` — `api_keys` table for VAR self-service keys.
- `supabase/migrations/20260802000000_support_kb.sql` — `tickets.sla_due_at` column + `kb_articles` table.

(Note: `rbac_foundation.sql` and all earlier migrations already existed.)

## Features delivered

### 1. Impersonation (audited session swap + banner)
- `src/lib/supabase/require-auth.ts` swaps the effective identity to the target
  user when a valid, opaque `bb_impersonate_id` cookie + active audit row exist.
- `src/app/api/admin/impersonation/route.ts` logs start/stop and returns target meta.
- `src/lib/impersonation.ts` (client cookie helpers), `ImpersonationBanner.tsx`,
  and an "Impersonate" action on the admin Users page.

### 2. Granular RBAC
- `can()` helper in `permissions.ts`; `useCan()` hook; server `requirePermission()` guard.
- `src/app/api/admin/rbac/permissions/route.ts` GET endpoint (live matrix).
- Admin "Roles & Access" page now renders a real permission matrix (was a stub).

### 3. API keys (VAR self-service)
- `api_keys` table + `requireApiKey()` Bearer-token verifier.
- `/api/var/api-keys` (GET/POST) + `/api/var/api-keys/[id]` (DELETE).
- `/var/api-keys` UI (sidebar entry added) + `useAuth().isAdmin()` wiring.

### 4. SMS / SMTP sender config (white-label sender fix)
- `TenantBranding` gains `emailFromName`, `emailFromAddress`, `smsSenderId`.
- `EmailService` now sends From: "<brand name> <address>" (fixes the
  "Byte-Back" sender-name gap) and honors a per-tenant SMS sender ID.
- `/api/var/communications` (GET/PATCH) + `/var/communications` UI.
- Admin tenant editor gained Outbound communications + Auth & access sections.

### 5. Support depth — Knowledge Base + ticket SLAs
- `kb_articles` table + `/api/kb` (GET/POST) + `/api/kb/[id]` (GET/PATCH/DELETE).
- Customer `/support/knowledge-base` + admin `/admin/knowledge-base` (CRUD, publish).
- Tickets now compute `sla_due_at` from priority and display On track / Due soon /
  Breached / Met badges. The Support page is now functional (was a stub).

### 6. Auth enforcement
- IP allowlist: tenant `allowedIps` enforced in `requireAuth` (CIDR + exact match).
- MFA: enrollment/management UI already existed in Profile; added a "require MFA"
  tenant flag + an in-UI nudge banner when required but unenrolled.
- Password policy: tenant `passwordPolicy` (minLength / uppercase / number /
  symbol) validated client-side in the Profile password-change flow.

## Deferred (require product input — NOT built to avoid fabricating behavior)
- **SSO** (SAML/OIDC) for VARs — needs provider + config decisions.
- **Payment gateway** client integration — deferred per product input.
- **Human live chat** handoff — deferred per product input.
These are intentionally left out; the rest of the platform is fully wired.

## How to ship
1. Apply the two new migrations.
2. (Optional) seed `kb_articles` / `api_keys` as needed.
3. Push when the user says so — nothing has been committed/pushed.
