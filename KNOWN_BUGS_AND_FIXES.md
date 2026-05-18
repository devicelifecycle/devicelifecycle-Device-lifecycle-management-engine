# KNOWN BUGS AND FIXES
## Device Lifecycle Management Engine

Last updated: 2026-05-17

---

## FIXED — Security & Auth

### [WORKING VERIFIED] BUG-001: Vendor null org exposes all orders
- **Description:** A vendor user with `organization_id = null` bypassed the vendor filter in `OrderService.getOrders()` and could see all orders in the system.
- **Root cause:** The vendor filter block `if (requester_role === 'vendor')` proceeded to build a DB query using `organization_id` without checking if it was null first. A null org_id made the `.eq('organization_id', null)` filter a no-op.
- **Files:** `src/services/order.service.ts`
- **Fix (commit 8b0459d):**
```typescript
if (requester_role === 'vendor') {
  if (!requester_organization_id) {
    return { data: [], total: 0, page, page_size, total_pages: 0 }
  }
  // ... rest of vendor filter
}
```
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-002: Inverted role guard on internal-only endpoints
- **Description:** 15 API routes had an inverted role guard: `if (profile && ['customer', 'vendor'].includes(profile.role))` — this only blocked customer/vendor if profile was non-null. If `profile` was null (unauthenticated or DB error), the check was skipped and the response returned ALL data to an unauthenticated caller.
- **Root cause:** Guard should be fail-closed: block if no profile OR if role is customer/vendor. The original code was fail-open.
- **Files affected:** 15 routes including organizations, pricing, devices, health
- **Fix (commit 8b0459d):** Changed to `if (!profile || ['customer', 'vendor'].includes(profile?.role))`
- **Manual fixes required for:** `organizations/[id]/route.ts` and `organizations/route.ts` (TypeScript narrowing required different structure)
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-003: Cookie double-read (active role decoded twice)
- **Description:** In `require-auth.ts`, `dlm_active_role` cookie was read once with `get()` and once with `getAll()` causing double decoding in some edge cases.
- **Files:** `src/lib/supabase/require-auth.ts`
- **Fix (commit 45a7773):** Single `cookieStore.get('dlm_active_role')?.value` read with explicit `decodeURIComponent()`.
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-004: is_active check missing on order detail
- **Description:** `GET /api/orders/[id]` and `PATCH /api/orders/[id]` fetched user profile but never checked `is_active`. Deactivated users could still view and edit orders.
- **Files:** `src/app/api/orders/[id]/route.ts`
- **Fix (commit 357ddac):**
```typescript
.select('role, organization_id, is_active')
if (!userProfile || !userProfile.is_active) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```
- **Status:** FIXED

---

## FIXED — Functional Bugs

### [WORKING VERIFIED] BUG-005: Quote email had relative URLs
- **Description:** Quote email sent to customers contained links like `/customer/orders/abc123` without the domain. Links were broken (clicking opened a relative path, not the actual site).
- **Root cause:** `pricingUrl` and `orderUrl` were built without `NEXT_PUBLIC_SITE_URL`, which falls back to empty string when env var is not set.
- **Files:** `src/app/api/orders/[id]/send-quote-email/route.ts`, `src/services/notification.service.ts`
- **Fix (commit 45a7773 + prior):**
  - Created `getSiteUrl()` in `src/lib/utils.ts` that checks `NEXT_PUBLIC_SITE_URL → VERCEL_URL → ''`
  - Quote email uses `req.nextUrl` origin as fallback when env URL is missing
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-006: Duplicate orders on Back navigation
- **Description:** After creating an order, the creation form was added to browser history via `router.push()`. Pressing the browser Back button returned to the filled form. If the user submitted again, a second POST created a duplicate order with a new ID.
- **Root cause:** `router.push()` keeps the form page in history; `router.replace()` replaces it so Back skips the form.
- **Files:**
  - `src/app/(dashboard)/orders/new/page.tsx`
  - `src/app/(dashboard)/orders/new/trade-in/page.tsx`
  - `src/app/(dashboard)/orders/new/cpo/page.tsx`
- **Fix (commit 72348ce):**
  - Changed all `router.push()` after creation to `router.replace()`
  - Added `submittedRef = useRef(false)` guard in each form — blocks re-entry once submission begins; resets only on error
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-007: Sales users locked out of pricing on their own orders
- **Description:** After creating an order, sales users went to the order detail page and found no "Edit & Send Quote" button. The button required `canSetPricingByRole` which excluded sales. With no in-page path to set prices, they navigated Back (causing BUG-006) looking for an edit path.
- **Root cause:** `canSetPricingByRole = user?.role === 'admin' || user?.role === 'coe_manager'` — too restrictive.
- **Files:** `src/app/(dashboard)/orders/[id]/_client.tsx`
- **Fix (commit 72348ce):** Added `sales` to `canSetPricingByRole`.
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-008: hasRole() ignored activeRole
- **Description:** `hasRole()` in `useAuth.ts` only checked `state.user.role`, not `state.activeRole`. Users with secondary roles (dual-role feature) who had switched to their secondary role would fail `hasRole()` checks, causing conditional UI to incorrectly hide features.
- **Files:** `src/hooks/useAuth.ts`
- **Fix (commit 357ddac):**
```typescript
const hasRole = useCallback((role: UserRole | UserRole[]) => {
  if (!state.user) return false
  const roles = Array.isArray(role) ? role : [role]
  return roles.includes(state.user.role) || (state.activeRole != null && roles.includes(state.activeRole))
}, [state.user, state.activeRole])
```
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-009: Notification service queried all users then JS-filtered
- **Description:** `NotificationService` was fetching ALL users from the DB then filtering by role in JavaScript. On large datasets this is an N-row query that wastes bandwidth.
- **Files:** `src/services/notification.service.ts`
- **Fix:** Added `.in('role', ['admin', 'coe_manager'])` to the Supabase query, removed the JS `.filter()`.
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-010: Sequential notification inserts (N × await)
- **Description:** When creating notifications for multiple users (e.g. exception alerts), the code looped `for (const user of orgUsers) { await this.createNotification(...) }`. Each notification was a separate awaited DB call, making the loop O(N) sequential.
- **Files:** `src/services/notification.service.ts`
- **Fix:** Replaced with `await Promise.all(orgUsers.map(user => this.createNotification(...)))`.
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-011: CSV upload accepted non-UUID device IDs
- **Description:** `upload-csv` API route accepted `preresolved_device_id` from CSV rows without UUID format validation. A malformed ID could cause silent failure or injection into the DB query.
- **Files:** `src/app/api/orders/upload-csv/route.ts`
- **Fix (commit 45a7773):** Added UUID regex validation before using the value.
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-012: Device catalog competitor price upsert used wrong conflict key
- **Description:** When auto-scraping prices for a new device, the upsert used `onConflict: 'device_id,competitor_name,storage,condition'` — a constraint that doesn't exist in the DB. Caused Supabase error on every new device scrape.
- **Root cause:** Competitor prices table unique key is different from what was assumed.
- **Fix:** Changed to delete-then-insert strategy for new device scrapes. Fresh data replaces stale without relying on upsert conflict resolution.
- **Status:** FIXED

---

### [WORKING VERIFIED] BUG-013: Customer quote accept page missing
- **Description:** Quote email sent to customers contained a "View & Accept Quote in Portal" link to `/customer/orders/[id]`. That route didn't exist — customers got a 404.
- **Files:** Created `src/app/(dashboard)/customer/orders/[id]/page.tsx`
- **Fix (commit 357ddac):** Created customer order detail page with:
  - Quote summary cards
  - Line items table
  - Accept/Decline banner for `quoted` status orders
  - Uses `useOrder()` hook + `/api/orders/[id]/transition`
- **Status:** FIXED

---

## KNOWN ISSUES — Not Yet Fixed

### [NEEDS FIX] BUG-014: N+1 vendor notification query on CPO order creation
- **Description:** When a CPO order is created, the system notifies all vendors. The current implementation queries vendors one by one in a loop.
- **Files:** `src/services/notification.service.ts` (CPO order notification section)
- **Recommended fix:** Batch query all vendor users, then `Promise.all()` for notification inserts
- **Priority:** Medium (performance, not a correctness bug)
- **Status:** NEEDS FIX

---

### [NEEDS FIX] BUG-015: 90+ API routes still use getUser() instead of requireAuth()
- **Description:** Most routes call `supabase.auth.getUser()` (HTTP round-trip to Supabase Auth) on every request. `requireAuth()` (JWT-local decode) is faster and cheaper.
- **Impact:** ~100-250ms extra latency per API call
- **Priority:** Low-medium (performance, not security)
- **Status:** NEEDS FIX — large sprint, defer to Phase 2

---

### [INCOMPLETE] BUG-016: Missing 404 page for invalid order IDs
- **Description:** Navigating to `/orders/not-a-valid-id` causes an unhandled error rather than a clean 404 page. UUID validation exists in the API but the page component doesn't handle the `null` order case gracefully.
- **Files:** `src/app/(dashboard)/orders/[id]/_client.tsx`
- **Status:** INCOMPLETE

---

### [PARTIALLY WORKING] BUG-017: Telus scraper intermittent auth failures
- **Description:** Telus TS adapter occasionally fails to maintain session cookies across requests. GoRecell and Bell work consistently. Telus has been set to `TELUS_SCRAPER_MODE=ts` but the Python `telus_worker.py` was written as a more reliable alternative.
- **Status:** PARTIALLY WORKING — switch to `TELUS_SCRAPER_MODE=scrapling` if TS adapter fails repeatedly

---

### [INCOMPLETE] BUG-018: Dual-role secondary_role not shown in admin user edit form
- **Description:** The DB column `users.secondary_role` was added in migration `20260512000000_add_secondary_role.sql`. The backend types and `require-auth.ts` support it. But the Admin → Users → Edit form does not yet have a "Secondary Role" field to set it.
- **Files:** `src/app/(dashboard)/admin/users/page.tsx`, `src/app/api/users/[id]/route.ts`
- **Status:** INCOMPLETE — column exists, API needs PATCH handler update, UI needs select field

---

### [INCOMPLETE] BUG-019: Quote email missing line items table
- **Description:** The quote email currently shows Order Number, Total Amount, Date. Planned enhancement: add a line items table (device, storage, condition, qty, unit price) and the portal accept link in the email body.
- **Files:** `src/app/api/orders/[id]/send-quote-email/route.ts`
- **Plan exists:** See archived plan `sorted-sleeping-rossum.md`
- **Status:** INCOMPLETE — designed, not implemented

---

### [INCOMPLETE] BUG-020: Order split UI not surfaced for admin/coe_manager
- **Description:** `OrderSplitService` and `POST /api/orders/[id]/split` exist and work. But there's no button or dialog in `_client.tsx` to trigger a split. Admins must call the API directly.
- **Status:** INCOMPLETE — backend done, frontend UI missing

---

## Fix History Timeline

| Date | Commit | Fixes |
|---|---|---|
| 2026-05-17 | 72348ce | BUG-005 (router.replace), BUG-006 (submittedRef), BUG-007 (sales pricing) |
| 2026-05-17 | 357ddac | BUG-008 (hasRole), BUG-013 (customer order page) |
| 2026-05-17 | 8b0459d | BUG-001 (vendor null org), BUG-002 (inverted guards), BUG-004 (is_active) |
| 2026-05-17 | 45a7773 | BUG-003 (cookie), BUG-011 (UUID), BUG-005 partial (email URL) |
| Earlier | 8752d03 | Auto-scrape trigger on device create |
| Earlier | 0ae0297 | Year/CPU/RAM in device catalog form |
