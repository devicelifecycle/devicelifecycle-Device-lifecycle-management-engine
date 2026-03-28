# Security Remediations Applied (Mar 2026)

This document summarizes frontend and API security fixes applied to the Device Lifecycle Management Engine.

## Fixes Applied

### 1. Content Security Policy (CSP) – tightened

- **Removed** `'unsafe-eval'` from `script-src` to reduce XSS risk.
- **Added** `base-uri 'self'` and `form-action 'self'` for defense in depth.

**File:** `next.config.js`

### 2. Error message sanitization – information leakage

- Replaced raw `error.message` in API responses with `safeErrorMessage()` so internal details (DB errors, stack traces, column names) are not exposed to clients.
- `safeErrorMessage()` returns detailed messages in development and generic fallbacks in production.

**Files updated:**
- `src/app/api/orders/[id]/split/route.ts`
- `src/app/api/orders/[id]/items/route.ts`
- `src/app/api/imei/[imei]/route.ts`
- `src/app/api/imei/lookup/route.ts`
- `src/app/api/pricing/model/route.ts`
- `src/app/api/shipments/[id]/purchase-label/route.ts`

### 3. Validation error details – schema leakage

- `src/app/api/users/route.ts`: Removed `details: validationResult.error.errors` from validation failure responses to avoid exposing schema structure.
- `src/app/api/orders/[id]/items/route.ts`: Removed `details` from bulk update validation errors; bulk update item errors no longer include raw Postgres messages.

### 4. Supabase configuration – fail fast

- **Client** (`src/lib/supabase/client.ts`): In production, throw if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing or invalid instead of using placeholder values.
- **Auth callback** (`src/app/auth/callback/route.ts`): Redirect to `/login?error=config` if Supabase env vars are not set in production.

### 5. npm audit

- Ran `npm audit fix` to apply non-breaking dependency updates (e.g. dompurify).

---

## Remaining Recommendations

### Dependencies (require major version changes)

1. **Next.js** (10.0.0–15.5.9) – DoS via Image Optimizer (GHSA-9g9p-9gw9-jx7f) and RSC deserialization (GHSA-h25m-26qc-wcjf)
   - **Action:** Upgrade to `next@15.5.10` or `next@16.1.5+`.
   - **Note:** Major version upgrade; run full regression tests.

2. **@supabase/ssr** – uses vulnerable `cookie` (GHSA-pxg6-pf52-xh8x)
   - **Action:** Upgrade to `@supabase/ssr@0.9.0` (breaking change).

3. **minimatch** (via @typescript-eslint) – ReDoS
   - **Action:** Upgrade ESLint and @typescript-eslint packages to versions that no longer depend on vulnerable minimatch.

### Operational

- Apply strict request size limits at reverse proxy (e.g. nginx, cloud load balancer) to help mitigate Image Optimizer DoS until Next.js is upgraded.
- Restrict or remove untrusted `remotePatterns` in `next.config.js` if you add new image domains.
