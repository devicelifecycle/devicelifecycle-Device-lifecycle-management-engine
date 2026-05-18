# PENDING TASKS
## Device Lifecycle Management Engine

Last updated: 2026-05-17

---

## PRIORITY 1 — Critical / High Impact

### TASK-001: Secondary Role UI for Admin
**Status:** INCOMPLETE
**Description:** The `users.secondary_role` column exists in the DB. `require-auth.ts`, `useAuth.ts`, and `src/proxy.ts` all support it. But the Admin → Users edit form has no field to set it, and `PATCH /api/users/[id]` doesn't accept `secondary_role` in its body.

**Files to change:**
1. `src/app/(dashboard)/admin/users/page.tsx` — Add "Secondary Role" select in user edit dialog
   - Options: None, Customer (if primary is vendor), Vendor (if primary is customer)
   - Send `{ secondary_role: 'customer' | 'vendor' | null }` in PATCH body
2. `src/app/api/users/[id]/route.ts` — Accept + validate `secondary_role` in PATCH handler (admin-only)

**Business value:** Allows a company acting as both vendor AND customer to use one login with role switching.

---

### TASK-002: Quote Email Line Items + Portal Accept Link
**Status:** INCOMPLETE
**Description:** The "Send Quote Email" button sends a basic email (order number, total, date). It's missing:
1. A line items table (device, storage, condition, qty, unit price)
2. A "View & Accept Quote in Portal" button linking to `/customer/orders/{orderId}`

**File:** `src/app/api/orders/[id]/send-quote-email/route.ts`

**Implementation plan (from plan file `sorted-sleeping-rossum.md`):**
```typescript
// After safeOrderNumHtml is built
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
const orderUrl = `${siteUrl}/customer/orders/${order.id}`

// Line items rows
const itemRows = order.items?.map(item => `
  <tr>
    <td style="padding:6px 10px;border:1px solid #e0e0e0">${escapeHtml(item.device?.make || '')} ${escapeHtml(item.device?.model || '')}</td>
    <td style="padding:6px 10px;border:1px solid #e0e0e0">${escapeHtml(item.storage || '')}</td>
    <td style="padding:6px 10px;border:1px solid #e0e0e0">${escapeHtml(item.actual_condition || item.claimed_condition || '')}</td>
    <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right">${item.quantity}</td>
    <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right">$${(item.unit_price || 0).toFixed(2)}</td>
  </tr>
`).join('') || ''

// Portal accept button (add to HTML email body)
// <div style="margin:24px 0;text-align:center">
//   <a href="${orderUrl}" style="...">View &amp; Accept Quote in Portal</a>
// </div>
```

---

### TASK-003: 404 Page for Invalid Order IDs
**Status:** INCOMPLETE
**Files:** `src/app/(dashboard)/orders/[id]/_client.tsx`

When `order` is null (not found or unauthorized), show a clear 404/access-denied state instead of crashing or blank page.

```tsx
if (!isLoading && !order) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-2xl font-bold">Order not found</p>
      <p className="text-muted-foreground">This order doesn't exist or you don't have access to it.</p>
      <Link href="/orders"><Button variant="outline">Back to Orders</Button></Link>
    </div>
  )
}
```

---

## PRIORITY 2 — Medium Impact

### TASK-004: Order Split UI
**Status:** INCOMPLETE — backend done, frontend missing
**Description:** `POST /api/orders/[id]/split` + `OrderSplitService` are fully implemented. But there's no UI button or dialog in the order detail page to trigger a split.

**Files:**
- `src/app/(dashboard)/orders/[id]/_client.tsx` — Add "Split Order" button in header actions (admin/coe_manager only)
- Dialog: select which items go to which sub-order, optional vendor assignment per split

---

### TASK-005: Migrate Routes from getUser() to requireAuth()
**Status:** NEEDS FIX — performance improvement
**Description:** 90+ API routes use `supabase.auth.getUser()` (HTTP call to Supabase). `requireAuth()` in `src/lib/supabase/require-auth.ts` decodes the JWT locally (no network call), ~100-250ms faster per request.

**Migration pattern:**
```typescript
// Before:
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const { data: profile } = await supabase.from('users').select('role,...').eq('id', user.id).single()

// After:
const auth = await requireAuth()
if (!auth) return unauthorized()
const { supabase, profile, effectiveRole } = auth
```

**Priority routes to migrate first:**
- `/api/orders/route.ts`
- `/api/customers/route.ts`
- `/api/vendors/route.ts`
- `/api/notifications/route.ts`

---

### TASK-006: Fix N+1 Vendor Notifications on CPO Order Creation
**Status:** NEEDS FIX
**Files:** `src/services/notification.service.ts`

When a CPO order is created, the system should notify all active vendors. Current code loops and awaits each notification. Should use `Promise.all()`:

```typescript
// Find all vendor users once
const { data: vendorUsers } = await supabase
  .from('users')
  .select('id')
  .eq('role', 'vendor')
  .eq('is_active', true)

// Batch create notifications
await Promise.all(
  (vendorUsers || []).map(user => this.createNotification({
    user_id: user.id,
    type: 'in_app',
    title: 'New CPO sourcing opportunity',
    message: `Order ${orderNumber} is open for bids`,
    link: `/vendor/orders/${orderId}`,
  }))
)
```

---

### TASK-007: Triage Upload Template API
**Status:** PARTIALLY WORKING
**Files:** `src/app/api/triage/upload-template/route.ts`
**Description:** The template upload endpoint exists but the frontend COE triage page may not surface it. Verify the upload button exists and works end-to-end.

---

### TASK-008: Shipping Label Purchase UI
**Status:** PARTIALLY WORKING — backend done
**Files:** `src/app/api/shipments/[id]/purchase-label/route.ts`
**Description:** Shippo integration exists for purchasing labels. The API endpoint is built. Verify there's a "Purchase Label" button in the shipment detail or COE shipping page.

---

## PRIORITY 3 — Low Impact / Future Features

### TASK-009: Pricing Training UI
**Status:** INCOMPLETE
**Description:** `POST /api/pricing/train` exists. There should be a button in the Admin → Pricing page to manually trigger training + view accuracy reports from `GET /api/pricing/accuracy`.

---

### TASK-010: Customer Request / Support Ticket Flow
**Status:** INCOMPLETE
**Description:** `src/app/(dashboard)/customer/requests/` directory exists but may be a stub. The customer portal should have a way to submit general service requests, not just orders.

---

### TASK-011: Reconciliation Report
**Status:** PARTIALLY WORKING
**Files:** `src/app/api/reports/reconciliation/route.ts`
**Description:** The reconciliation report API exists. Verify it's surfaced in the Reports page at `/reports`.

---

### TASK-012: Chat Assistant Full Integration
**Status:** PARTIALLY WORKING
**Files:** `src/app/api/chat/route.ts`, `src/components/chat/ChatAssistant.tsx`
**Description:** AI chat (Groq) is wired up. Verify:
1. `GROQ_API_KEY` is set
2. Chat panel is accessible from all dashboard pages
3. Tools defined in `src/lib/chat/tools.ts` are functioning

---

### TASK-013: IMEI Device Identification
**Status:** PARTIALLY WORKING
**Files:** `src/app/api/imei/[imei]/route.ts`, `src/services/imei.service.ts`
**Description:** IMEI lookup is implemented. Verify it's used in the triage workflow when COE receives devices.

---

### TASK-014: International Pricing
**Status:** INCOMPLETE
**Files:** `src/app/api/pricing/international/route.ts`, migration `20260312000000_international_pricing.sql`
**Description:** International pricing schema exists. The UI to configure and display international prices (CAD vs USD, regional overrides) needs to be built.

---

### TASK-015: Vendor Performance Dashboard
**Status:** PARTIALLY WORKING
**Files:** `src/app/api/vendors/[id]/performance/route.ts`, `src/app/(dashboard)/vendors/[id]/page.tsx`
**Description:** Vendor performance API exists. Verify it's displayed in the vendor detail page (fill rates, response times, bid win rates).

---

## COMPLETED TASKS (for reference)

| Task | Date | Commit | Description |
|---|---|---|---|
| Phase 1 build | Earlier | — | All 32 pages + API routes built, 0 build errors |
| Audit Round 1 | Earlier | — | 6 bugs fixed, 10 missing API routes created |
| Audit Round 2 | Earlier | — | 12 data-flow/logic bugs fixed |
| Device catalog Year/CPU/RAM | 2026-05-17 | 0ae0297 | Added spec fields to form + table |
| Auto-scrape on device add | 2026-05-17 | 8752d03 | Fire-and-forget scraper trigger |
| Security audit fixes | 2026-05-17 | 8b0459d | 3 critical security bugs patched |
| Auth + workflow fixes | 2026-05-17 | 357ddac | is_active, hasRole, customer order page |
| Duplicate order fix | 2026-05-17 | 72348ce | router.replace + submittedRef + sales pricing |
| MacBook Pro 16" 2019 catalog | 2026-05-17 | — | Device added + prices scraped (Apple $720 CAD, Bell $120 CAD) |
