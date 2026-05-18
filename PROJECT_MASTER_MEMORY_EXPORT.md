# PROJECT MASTER MEMORY EXPORT
## Device Lifecycle Management Engine

**Export Date:** 2026-05-17
**Export Purpose:** Full knowledge transfer — new developer/AI can continue without any missing context.

---

# PROJECT OVERVIEW

| Field | Value |
|---|---|
| **Project Name** | Device Lifecycle Management Engine |
| **Short Name** | DLM Engine |
| **Purpose** | Enterprise platform for managing used/refurbished device trade-ins, CPO purchases, pricing, vendor sourcing, and COE fulfillment operations |
| **Business Idea** | A company (the "COE" — Center of Excellence) acts as a middleman: they buy used devices from customers (trade-in), source refurbished devices from vendors (CPO), handle device inspection/triage/QC, and resell to enterprise customers. This platform automates the entire lifecycle |
| **Main Goals** | 1. Streamline order creation for customers and sales reps. 2. Automate market-referenced pricing from competitor data. 3. Manage the COE fulfillment pipeline (intake → triage → ship). 4. Provide customer and vendor portals for self-service. 5. Track SLA performance and send automated notifications |
| **Current Status** | Phase 1 COMPLETE (all pages built, 0 build errors). Phase 2 in progress (security hardening, workflow fixes, feature additions) |
| **Git Repo** | devicelifecycle/devicelifecycle-Device-lifecycle-management-engine |
| **Main Branch** | main |

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.2 |
| Language | TypeScript | 5.x |
| Runtime | React | 19.2.4 |
| Database | Supabase (PostgreSQL) | Latest |
| Auth | Supabase Auth (JWT + MFA) | Latest |
| Realtime | Supabase Realtime | Latest |
| State | TanStack Query (React Query) | 5.17 |
| Styling | Tailwind CSS | 3.x |
| UI Components | Radix UI + shadcn/ui | Latest |
| Form Validation | Zod | 3.22 |
| Email | Resend / Gmail SMTP / Nodemailer | Latest |
| SMS | Twilio | 5.13 |
| AI | Groq (Llama-3.3-70B) | Latest |
| PDF | jsPDF | Latest |
| Excel | xlsx (SheetJS) | Latest |
| CSV | PapaParse | Latest |
| Scraping (TS) | Cheerio | 1.0 |
| Scraping (Python) | Camoufox + Playwright + Patchright | Latest |
| Shipping | Shippo + Stallion Express | Latest |
| Testing | Vitest + Playwright | Latest |
| Deployment | Vercel | Latest |

---

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin key |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for email links |
| `RESEND_API_KEY` | Email delivery (preferred) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Email delivery (alternative) |
| `TWILIO_*` | SMS notifications |
| `GROQ_API_KEY` | AI chat assistant |
| `SCRAPER_*_ENABLED` | Per-provider scraper flags |
| `CRON_SECRET` | Protect cron endpoints |

Full variable reference: see `API_AND_ENV_SETUP.md`

---

# ROLES AND PERMISSIONS

## The 6 Roles

| Role | Type | Description | Default Path |
|---|---|---|---|
| `admin` | Internal | Full system access, user management, pricing config | /dashboard |
| `coe_manager` | Internal | Order management, vendor assignment, triage oversight | /dashboard |
| `coe_tech` | Internal | Device triage, receiving, shipping | /dashboard |
| `sales` | Internal | Order creation, customer management | /dashboard |
| `customer` | External | Submit orders, view quotes, accept/reject | /customer/orders |
| `vendor` | External | View open CPO orders, submit bids, track fulfillment | /vendor/orders |

## Dual-Role Feature

A company that is both a vendor AND a customer (e.g., trade-in their own fleet AND buy CPO devices) can have one login with a `secondary_role`. They use a "Switch View" button in the Header to toggle between portals.

**DB column:** `users.secondary_role user_role NULL`
**Cookie:** `dlm_active_role` (8h TTL, validated against DB on API calls)
**Hook:** `useAuth.switchRole(targetRole)` validates → sets cookie → navigates

**Status:** DB + API + middleware support complete. Admin UI to set `secondary_role` is INCOMPLETE (see PENDING_TASKS.md TASK-001).

---

# FULL CHAT MEMORY LOG

## Conversation Block 1 — Initial Build (Phase 1)

**What was built:**
- All 6 role-based portals (admin, coe_manager, coe_tech, sales, customer, vendor)
- All 32+ dashboard pages
- 114 API routes
- 21 server-side services
- 15 custom React hooks
- 52 database migrations
- Supabase Auth integration with cookie-based routing
- Market-referenced pricing engine V2
- Competitor price scrapers (Bell, Telus, GoRecell, Apple, UniverCell)
- PDF + Excel quote generation
- Email notifications (Resend/Gmail)
- Realtime updates via Supabase subscriptions

**Result:** Full Phase 1 build passing with 0 TypeScript errors, 0 build errors.

---

## Conversation Block 2 — Audit Round 1

**What was audited:** All pages and API routes
**Bugs found and fixed:**
1. Pagination using `limit` instead of `page_size` in multiple hooks
2. `total_pages` vs `totalPages` case mismatch
3. `deactivateCustomer` vs `deleteCustomer` naming
4. Sidebar nav keys using `item.href` (duplicates) → fixed to `item.title`
5. Dashboard redirect to `/orders` → fixed to `/` (redirects to `/dashboard`)
6. DB sort columns wrong (`name` vs `company_name`)
7. 10 missing API routes created
8. Supabase `.or()` not filtering on foreign table columns — fixed

---

## Conversation Block 3 — Audit Round 2

**12 additional bugs fixed:**
1. Pagination consistency across all hooks
2. Column name mismatches (company_name vs name)
3. Enum mismatches between validations.ts and types/index.ts
4. Order redirect fixes
5. Validation schema corrections
6. API route data flow corrections

---

## Conversation Block 4 — Device Catalog + MacBook Addition

**What happened:**
- User uploaded image of 6 MacBook Pro 16-inch 2019 devices (A2141, Intel i7, 16GB, 512GB, various conditions)
- Added MacBook Pro 16" 2019 to device catalog as single SKU entry
- Scraped competitor prices: Apple Trade-In ($720.26 CAD), Bell ($120 CAD)
- Added Year/CPU/RAM fields to device catalog form + table

**Files changed (commit 0ae0297):**
- `src/app/(dashboard)/devices/page.tsx` — form + table + state updates

---

## Conversation Block 5 — Auto-Scrape on Device Add

**Request:** "When ever a new device added in catalog, it should auto pull the prices using scrapper"

**Implementation (commit 8752d03):**
- Added fire-and-forget `triggerScraperForDevice(device)` call in `POST /api/devices`
- Uses `createServiceRoleClient()` to bypass RLS for scraper operations
- Calls `runScraperPipeline()` with device's storage options
- Non-blocking (void promise) — device creation returns immediately

**Files changed:** `src/app/api/devices/route.ts`

---

## Conversation Block 6 — Security Audit

**Security audit conducted by AI acting as "Senior Security Auditor"**

### Critical Security Bugs Found and Fixed

**BUG: Vendor null org exposes all orders**
- Vendor with `organization_id = null` bypassed vendor filter
- Fix: Early return `{ data: [], ... }` if `requester_organization_id` is null
- File: `src/services/order.service.ts`
- Commit: 8b0459d

**BUG: Inverted role guard (fail-open)**
- 15 routes had `if (profile && ['customer','vendor'].includes(role))` — blocked only when profile exists
- Should be `if (!profile || ['customer','vendor'].includes(role))` — fail closed
- Files: 15 internal API routes
- Commit: 8b0459d

**BUG: Missing is_active check**
- Order detail API fetched profile but never checked `is_active`
- Deactivated users could still view/edit orders
- File: `src/app/api/orders/[id]/route.ts`
- Commit: 357ddac

**BUG: hasRole() ignored activeRole**
- Dual-role users who switched roles failed UI `hasRole()` checks
- File: `src/hooks/useAuth.ts`
- Commit: 357ddac

**Other security fixes:**
- Cookie double-read in require-auth.ts (45a7773)
- Email URL relative links fixed (45a7773)
- UUID validation in CSV upload (45a7773)
- Notification DB query moved server-side (removed JS filter)
- Sequential notification inserts → Promise.all()
- Device catalog data leakage guard inverted → fixed
- Customer quote accept page created (357ddac)

---

## Conversation Block 7 — Order Workflow Fix

**Problem reported:** 
"When a new order is entered and moves into the 'Set Pricing' stage: the order can NO LONGER be edited - users are forced to go back - going back creates DUPLICATE / MULTIPLIED orders - there is NO proper edit workflow - order state management is broken"

**Root cause analysis:**
1. All 3 creation forms used `router.push()` after order creation → form stays in browser history
2. User hits Back → lands on filled form → submits again → duplicate order with new ID
3. Sales users had no pricing edit button → forced to go Back looking for edit path

**Fixes (commit 72348ce):**
1. `router.push()` → `router.replace()` in all 3 creation forms (removes form from history)
2. `submittedRef = useRef(false)` guard in each form (blocks double-submit)
3. Added `sales` to `canSetPricingByRole` in `_client.tsx` (unlocks "Edit & Send Quote" for sales)

---

## Conversation Block 8 — Master Export (this document)

**Request:** Generate full project documentation export (7 files)
**Files generated:**
1. `PROJECT_MASTER_MEMORY_EXPORT.md` (this file)
2. `PROJECT_QUICK_START.md`
3. `PROJECT_FOLDER_STRUCTURE.md`
4. `PENDING_TASKS.md`
5. `KNOWN_BUGS_AND_FIXES.md`
6. `API_AND_ENV_SETUP.md`
7. `FULL_WORKFLOW_DOCUMENTATION.md`

---

# AUTHENTICATION DOCUMENTATION

## Login Flow
1. `POST /api/auth` (Supabase client) with email + password
2. `supabase.auth.signInWithPassword()` returns JWT
3. JWT stored in Supabase cookie (httpOnly, secure)
4. Client reads session → fetches user profile from `users` table
5. Profile cached in `localStorage` (5-min TTL)
6. Routing cookies set: `dlm_role`, `dlm_uid` (8-hour TTL)
7. Redirect to role-default path

## Session Management
- JWT expiry: 604800 seconds (7 days)
- Idle timeout: 30 minutes (header component tracks mouse/keyboard activity)
- MFA: TOTP supported via `supabase.auth.mfa.*` (enroll/verify in profile page)

## Cookie Strategy
```
dlm_role    = user's primary role (for fast middleware routing)
dlm_uid     = user's ID (for cache invalidation)
dlm_active_role = currently active role (for dual-role switching)
```
All cookies: `SameSite=Lax; path=/; max-age=28800` (8 hours)

## Organization + User Provisioning
When admin creates a new Customer/Vendor org:
1. `POST /api/organizations`
2. `OrganizationService.createOrganization()` → creates org
3. `CustomerService.createCustomer()` or `VendorService.createVendor()` → linked record
4. `UserProvisioningService.provisionUser()` → creates auth account + DB record → sends welcome email

---

# FRONTEND DOCUMENTATION

## Pages (route → component → purpose)

### (auth) group — No dashboard shell

| Route | Component | Purpose |
|---|---|---|
| `/login` | `(auth)/login/page.tsx` | Login form |
| `/register` | `(auth)/register/page.tsx` | Self-registration (if enabled) |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | Password reset request |
| `/reset-password` | `(auth)/reset-password/page.tsx` | Set new password |
| `/auth/callback` | `(auth)/auth/callback/route.ts` | Supabase OAuth/magic link callback |

### (dashboard) group — With sidebar + header

| Route | Who Sees It | Purpose |
|---|---|---|
| `/dashboard` | Internal roles | KPI dashboard (orders, revenue, SLA) |
| `/orders` | Internal + Customer + Vendor | Order list with filters |
| `/orders/new` | Internal + Customer | Unified order creation |
| `/orders/new/trade-in` | Internal + Customer | Trade-in specific |
| `/orders/new/cpo` | Internal | CPO specific |
| `/orders/[id]` | All (role-filtered) | Order detail (3000+ line client) |
| `/customer/orders` | Customer, Vendor | Customer portal order list |
| `/customer/orders/[id]` | Customer | Customer order detail + accept/reject |
| `/vendor/orders` | Vendor | Vendor's assigned orders |
| `/vendor/bids` | Vendor | Open CPO orders to bid on |
| `/customers` | Admin, COE, Sales | Customer list + management |
| `/customers/new` | Admin | Create customer |
| `/customers/[id]` | Admin, COE, Sales | Customer detail + orders |
| `/vendors` | Admin, COE, Sales | Vendor list |
| `/vendors/[id]` | Admin, COE, Sales | Vendor detail + performance |
| `/devices` | Admin, COE | Device catalog management |
| `/reports` | Admin, COE | Analytics + reconciliation |
| `/notifications` | All | Notification center |
| `/profile` | All | User profile + MFA |
| `/bids` | Admin, COE | All bids management |
| `/exceptions` | Admin, COE | Exception queue |
| `/coe/receiving` | COE | Device intake |
| `/coe/triage` | COE | Device inspection |
| `/coe/exceptions` | COE | COE exception handling |
| `/coe/shipping` | COE | Outbound shipments |
| `/admin/users` | Admin | User management |
| `/admin/organizations` | Admin | Organization management |
| `/admin/pricing` | Admin | Pricing configuration |
| `/admin/sla-rules` | Admin | SLA rule management |
| `/admin/audit-log` | Admin | System audit trail |

## State Management

**Server State:** TanStack Query v5
- `staleTime: 30 * 1000` (30 seconds)
- `gcTime: 5 * 60 * 1000` (5 minutes)
- Realtime subscriptions invalidate cache on DB changes
- 30-second polling as safety net

**Auth State:** `useAuth` hook
- Local React state + context
- `localStorage` cache for persistence across tabs
- Cookie-based fast path for middleware

**UI State:** Local `useState` in components (no global client state library)

## Key Frontend Patterns

### Data Fetching Pattern
```typescript
// hooks/useOrders.ts pattern
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['orders', filters],
  queryFn: () => fetch('/api/orders?' + params).then(r => r.json()),
  staleTime: 30_000,
})
```

### Mutation Pattern
```typescript
const createMutation = useMutation({
  mutationFn: (data) => fetch('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
})
```

### Auth Guard in Pages
```typescript
const { user, isInitializing } = useAuth()
if (isInitializing) return <LoadingSpinner />
if (!user) return <Redirect to="/login" />
```

---

# BACKEND DOCUMENTATION

## Service Architecture

All services are static class methods, server-side only.

### OrderService
- `getOrders(filters)` — paginated list with role-based scoping
- `getOrderById(id)` — full order with items, customer, vendor, shipments
- `createOrder(data, userId)` — creates order + items, triggers notifications
- `updateOrder(id, data, userId)` — PATCH with audit log
- `deleteOrder(id, userId)` — soft concept, logs deletion
- `addOrderItem(orderId, item)` — add line item
- `updateOrderItem(orderId, itemId, data)` — update prices/condition
- `removeOrderItem(orderId, itemId)` — remove line item

### PricingService
- `calculatePrice(deviceId, storage, condition, type, options)` — V2 market-referenced
- `calculateBatch(items, orderType, customerId)` — batch for all items
- `calculateBuyback(items, depreciationRate)` — CPO buyback guarantee

### NotificationService
- `createNotification(data)` — insert notification
- `getUserNotifications(userId, unreadOnly, limit)` — fetch user's notifications
- `markRead(notificationId, userId)` — mark single read
- `markAllRead(userId)` — mark all read
- `notifyOrderStatus(order, oldStatus, newStatus)` — trigger notifications for status change
- `notifyException(input)` — notify all parties of triage exception

### EmailService
- Tries providers in order: Resend → Gmail SMTP → Generic SMTP → log-only
- `sendEmail({ to, subject, html, attachments })` — generic send
- `sendWelcomeEmail(email, name, role, tempPassword)` — onboarding
- `sendOrderStatusEmail(order, newStatus, recipientEmail)` — status notification
- `sendQuoteEmail(order, recipientEmail, attachments)` — quote with PDF + Excel

### UserProvisioningService
- `assertEmailAvailable(email)` — throws if email already used
- `provisionUser({ email, fullName, role, organizationId })` — create auth + DB user + send welcome

---

# INTEGRATIONS DOCUMENTATION

## Supabase
- **URL:** `NEXT_PUBLIC_SUPABASE_URL`
- **Anon key:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-side safe)
- **Service role:** `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS)
- **Features used:** Auth (JWT + MFA), Database (PostgreSQL), Realtime (WebSocket subscriptions), Storage (file uploads)
- **Client files:** `src/lib/supabase/{client,server,service-role,middleware}.ts`

## Resend (Email)
- **Key:** `RESEND_API_KEY`
- **SDK:** `resend@6.9.2`
- **Use case:** Transactional emails (welcome, quotes, notifications)
- **From address:** `RESEND_FROM_EMAIL` or default

## Twilio (SMS)
- **Keys:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- **SDK:** `twilio@5.13`
- **Use case:** SMS notifications for order events (optional)
- **Health check:** `GET /api/twilio/health`

## Groq AI (Chat Assistant)
- **Key:** `GROQ_API_KEY`
- **Model:** `llama-3.3-70b-versatile` (configurable via `GROQ_MODEL`)
- **SDK:** `groq-sdk`
- **Use case:** AI assistant in dashboard for order queries, pricing help
- **Endpoint:** `POST /api/chat`
- **Prompts:** `src/lib/chat/prompts.ts`
- **Tools:** `src/lib/chat/tools.ts`

## Shippo (Shipping Labels)
- **Key:** `SHIPPO_API_KEY`
- **Use case:** Multi-carrier label purchase for COE outbound shipments
- **Endpoint:** `POST /api/shipments/[id]/purchase-label`

## Stallion Express (Canadian Carrier)
- **Key:** `STALLION_API_KEY`
- **Use case:** Canadian shipping rates + tracking

## IMEI Check API
- **Key:** `IMEI_CHECK_API_KEY`
- **Use case:** Device verification during triage (carrier lock, model check)
- **Endpoint:** `GET /api/imei/[imei]`

## TestPod (Battery Health)
- **Key:** `TESTPOD_API_KEY`
- **URL:** `TESTPOD_API_URL`
- **Use case:** Battery health % during triage
- **Endpoint:** `GET /api/testpod/lookup`

## Price Scrapers

### TypeScript Adapters
| Provider | Adapter File | Mode Env Var | Status |
|---|---|---|---|
| Bell Canada | `scrapers/adapters/bell.ts` | `BELL_SCRAPER_MODE` | [WORKING VERIFIED] |
| Telus | `scrapers/adapters/telus.ts` | `TELUS_SCRAPER_MODE` | [PARTIALLY WORKING] |
| GoRecell | `scrapers/adapters/gorecell.ts` | `GORECELL_SCRAPER_MODE` | [WORKING VERIFIED] |
| Apple Trade-In | `scrapers/adapters/apple.ts` | `APPLE_SCRAPER_MODE` | [WORKING VERIFIED] |
| Universal | `scrapers/adapters/universal.ts` | N/A | [WORKING VERIFIED] |

### Python Workers (Scrapling)
| Provider | Worker File | Anti-Bot Method | Status |
|---|---|---|---|
| Bell | `scrapers_py/bell_worker.py` | Session auth | [WORKING VERIFIED] |
| Telus | `scrapers_py/telus_worker.py` | Patchright TLS | [WORKING VERIFIED] |
| GoRecell | `scrapers_py/gorecell_worker.py` | Camoufox | [WORKING VERIFIED] |
| Apple | `scrapers_py/apple_worker.py` | HTML parsing | [WORKING VERIFIED] |
| UniverCell | `scrapers_py/univercell_worker.py` | Server actions + TLS | [WORKING VERIFIED] |

**Worker Contract:**
- Input: JSON via stdin `{ devices: [{ make, model, storage }] }`
- Output: JSON via stdout `{ results: [ScrapedPrice] }`
- Timeout: `SCRAPLING_WORKER_TIMEOUT_MS` (default 30000ms)

---

# KNOWN IMPORTANT CODE PATTERNS

## Common Pitfalls (accumulated from debugging)

1. **`ORDER_STATUS_CONFIG.color`** is a Tailwind class (`text-blue-600`), NOT a hex color. Use as `className`, not `style={}`.

2. **`page_size` not `limit`** — all services use `page_size`. API routes must pass `page_size` key to services.

3. **`total_pages` snake_case** — services return `total_pages`. Hooks must read `.total_pages`, not `.totalPages`.

4. **`CustomerService.deactivateCustomer()`** — not `deleteCustomer()`. Soft delete only.

5. **Sidebar nav keys** — use `item.title` not `item.href` to avoid duplicate key React errors.

6. **Dashboard home** is at `/`, which redirects to `/dashboard`. NOT `/orders`.

7. **DB columns for customers/vendors** use `company_name` not `name`. Default sorts must use `company_name`.

8. **Supabase `.or()`** doesn't reliably filter on joined foreign tables — search only on main table columns.

9. **Validation enums in `validations.ts`** MUST match types in `types/index.ts` (DeviceCategory, NotificationType, AuditAction, etc.)

10. **`getSiteUrl()`** — always use this function for building email links. Never hardcode URLs or rely on env vars directly.
    ```typescript
    export function getSiteUrl(): string {
      const explicit = process.env.NEXT_PUBLIC_SITE_URL
      if (explicit) return explicit.replace(/\/+$/, '')
      const vercelUrl = process.env.VERCEL_URL
      if (vercelUrl) return `https://${vercelUrl}`
      return ''
    }
    ```

11. **`sanitizeOrderForVendor()`** — always apply when returning order data to vendor users.

12. **`requireAuth()`** vs `getUser()`** — `requireAuth()` is faster (local JWT decode). Prefer it in new API routes.

13. **`submittedRef` pattern** — always use in creation forms to prevent double-submit:
    ```typescript
    const submittedRef = useRef(false)
    // At top of handleSubmit:
    if (submittedRef.current) return
    // Before async call:
    submittedRef.current = true
    // In catch:
    submittedRef.current = false
    ```

14. **`router.replace()`** after order creation — not `router.push()`. Prevents Back-button duplication.

15. **`canSetPricingByRole`** includes `sales` role — sales can set prices on draft/submitted non-CPO orders.

---

# DEPLOYMENT DOCUMENTATION

## Vercel (Production)

**Build command:** `npm run build`
**Output directory:** `.next`
**Framework preset:** Next.js
**Node.js version:** 18.x or 20.x

### Environment Variables Required in Vercel
Set all variables from `API_AND_ENV_SETUP.md` in Vercel Project Settings → Environment Variables.

`NEXT_PUBLIC_SITE_URL` MUST be set to the actual domain (e.g., `https://dlm.yourdomain.com`).

### Vercel Cron (add to vercel.json)
```json
{
  "crons": [
    { "path": "/api/cron/sla-check", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/price-scraper", "schedule": "0 2 * * *" },
    { "path": "/api/cron/competitor-sync", "schedule": "0 3 * * *" },
    { "path": "/api/cron/bid-expiry", "schedule": "0 * * * *" },
    { "path": "/api/cron/pricing-staleness", "schedule": "0 4 * * *" },
    { "path": "/api/cron/pricing-training", "schedule": "0 5 * * 0" },
    { "path": "/api/cron/quote-price-check", "schedule": "0 6 * * *" },
    { "path": "/api/cron/shipping-tracking", "schedule": "0 */2 * * *" }
  ]
}
```

Cron routes must validate: `request.headers.get('authorization') === 'Bearer ' + process.env.CRON_SECRET`

## Local Development

```bash
npm install
cp .env.example .env.local  # fill in Supabase creds
npm run dev
```

App: http://localhost:3000

## Python Scrapers (only needed for advanced scraping)

```bash
cd scrapers_py
python3 -m venv .venv-scrapling
source .venv-scrapling/bin/activate
pip install -r requirements.txt
playwright install chromium
```

Set `SCRAPLING_PYTHON_BIN=./scrapers_py/.venv-scrapling/bin/python` in `.env.local`.

---

# TESTING DOCUMENTATION

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| admin | admin@dlm.local | Admin1234! |
| coe_manager | coe@dlm.local | Admin1234! |
| coe_tech | tech@dlm.local | Admin1234! |
| sales | sales@dlm.local | Admin1234! |
| customer | customer@dlm.local | Admin1234! |
| vendor | vendor@dlm.local | Admin1234! |

Create with: `node scripts/seed-test-users.mjs`

## Key Test Workflows

### Test 1: Trade-In Order Creation (No Duplication)
1. Login as `sales`
2. Navigate to `/orders/new`
3. Select a customer, add 1 device item
4. Click "Create Order"
5. Verify: navigates to order detail (e.g., `/orders/abc123`)
6. Press browser Back button
7. Verify: navigates to orders LIST (`/orders`), NOT back to the creation form
8. ✓ No duplicate order created

### Test 2: Sales Pricing (Edit & Send Quote)
1. Login as `sales`
2. Find a submitted trade-in order
3. Verify: "Edit & Send Quote" button is visible (should be — sales now included)
4. Click → enter prices → click "Save & Send Quote"
5. Verify: order status becomes `quoted`
6. Verify: quote email sent (check logs or actual email)

### Test 3: Customer Portal
1. Login as `customer`
2. Navigate to `/customer/orders`
3. Find a `quoted` order
4. Click → verify `/customer/orders/[id]` page loads with Accept/Decline banner
5. Click "Accept" → verify status transitions to `accepted`

### Test 4: Vendor Bid Flow
1. Login as `admin`
2. Create a CPO order, leave vendor unassigned, transition to `sourcing`
3. Login as `vendor`
4. Navigate to `/vendor/orders`
5. Find the open CPO order (should be visible)
6. Submit a bid
7. Login as `admin`
8. View the CPO order detail → accept the bid
9. Verify: vendor notified, vendor_id set on order

### Test 5: Triage Exception Flow
1. Login as `coe_tech`
2. Navigate to `/coe/triage`
3. Find a `received` order
4. Grade device lower than claimed → flag exception
5. Login as `customer`
6. Verify notification received
7. View `/customer/orders/[id]` → see exception banner with adjusted amount
8. Approve or reject exception

---

# FINAL PROJECT STATUS REPORT

## COMPLETED [WORKING VERIFIED]

- All 6 role portals (admin, coe, sales, customer, vendor) — fully functional
- All 114 API routes — implemented and secured
- 52 database migrations — applied and consistent
- Role-based routing (middleware cookie fast-path)
- Supabase Auth (JWT + MFA support)
- Market-referenced pricing engine V2 (Bell/Telus/GoRecell blend)
- Competitor price scrapers (Bell, GoRecell, Apple — stable; Telus — partially working)
- Auto-scrape trigger when device added to catalog
- PDF + Excel quote generation
- Email notifications (Resend/Gmail SMTP)
- Quote email with portal link (partially — missing line items table)
- Customer order detail page (`/customer/orders/[id]`)
- Order duplicate fix (router.replace + submittedRef)
- Sales role pricing unlock
- Security: vendor null org guard, fail-closed auth guards, is_active check
- Dual-role cookie system (DB + API + middleware ready)
- Device catalog with Year/CPU/RAM fields
- MacBook Pro 16" 2019 in catalog with scraped prices
- SLA management (rules + breach detection + notifications)
- Vendor bid system (open CPO orders, bid submission, acceptance)
- Triage workflow + exception handling
- Shipment tracking
- Notification system (in-app + email + SMS)
- Audit log
- Order splitting (backend complete)
- Bulk order operations (bulk transition, bulk delete)

## PARTIALLY COMPLETED [PARTIALLY WORKING]

- Telus scraper (TS adapter intermittent; Python worker works reliably)
- Quote email (sends successfully but missing line items table and accept button)
- Shipping label purchase (API done, UI needs verification)
- Chat assistant (API + component exist; needs GROQ_API_KEY verification)
- IMEI lookup in triage (API done; triage UI integration needs verification)
- Vendor performance dashboard (API done; UI display needs verification)

## INCOMPLETE [NEEDS IMPLEMENTATION]

- Secondary role admin UI (TASK-001) — DB ready, form not built
- Quote email line items + accept link (TASK-002)
- Order 404 page (TASK-003)
- Order split UI (TASK-004) — backend ready, no UI button
- Route migration to requireAuth() (TASK-005) — performance improvement
- International pricing UI (TASK-014)
- Pricing training UI (TASK-009)

## BROKEN [NEEDS FIX]

- N+1 vendor notifications on CPO creation (KNOWN_BUGS BUG-014) — functional but slow
- 90+ routes using slow getUser() instead of requireAuth() (BUG-015) — functional but slower

## HIGHEST PRIORITY FIXES

1. **Quote email line items + accept link** (TASK-002) — customer experience critical
2. **Secondary role admin UI** (TASK-001) — dual-role feature is useless without admin form
3. **Order 404 page** (TASK-003) — UX crash on invalid order IDs

## RECOMMENDED NEXT STEPS

1. Implement TASK-002 (quote email line items) — 1-2 hours
2. Implement TASK-001 (secondary role form) — 2-3 hours
3. Add TASK-003 (order 404 state) — 30 minutes
4. Verify chat assistant works with GROQ_API_KEY — 15 minutes
5. Migrate top 10 most-called routes to requireAuth() — 2-3 hours
6. Fix N+1 vendor notifications — 30 minutes
7. Add order split button to _client.tsx — 2-3 hours

---

*This document was generated 2026-05-17 from full project scan. It captures all context up to and including commit 72348ce. For the most recent changes, run `git log --oneline -10`.*
