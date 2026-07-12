# FULL WORKFLOW DOCUMENTATION
## Device Lifecycle Management Engine

---

## System Overview

The engine manages device trade-in and certified pre-owned (CPO) orders through a multi-stage pipeline involving customers, vendors, and an internal Center of Excellence (COE) team.

**Two Order Types:**
1. **Trade-In** — Customer submits used devices; COE quotes a buyback price; customer accepts; devices are shipped to COE; COE triages condition; final payout issued
2. **CPO (Certified Pre-Owned)** — Customer wants to buy refurbished devices; COE sources from vendors; vendor fulfills; devices ship to customer

---

## WORKFLOW 1: Trade-In Order Lifecycle

### Trigger
Customer or Sales rep creates a Trade-In order via `/orders/new` or `/orders/new/trade-in`.

### Status Machine
```
draft → submitted → quoted → accepted → sourcing → sourced →
shipped_to_coe → received → triage → triage_complete →
approved → closed
                         └→ rejected (customer rejects quote)
```

### Step-by-Step

#### Stage 1: Draft (status = `draft`)
- **Actor:** Sales, COE Manager, Admin, or Customer
- **Action:** Fill order form (select customer, add devices: make, model, storage, condition, notes)
- **DB operation:** `POST /api/orders` → `OrderService.createOrder()` inserts `orders` + `order_items` rows
- **Auto-actions:**
  - Order number generated (format: `TI-YYYYMM-NNNN`)
  - SLA timer starts (quote must be sent within X hours)
- **Edge cases:**
  - Customer users: `customer_id` auto-resolved from their org
  - CSV upload: fuzzy device matching via Levenshtein + alias table

#### Stage 2: Submitted (status = `submitted`)
- **Actor:** Customer hits "Submit" OR Sales/Admin transitions from draft
- **Action:** `POST /api/orders/[id]/transition` with `{ status: 'submitted' }`
- **Auto-notifications:**
  - Admin + COE Manager receive "New order submitted" notification
  - SLA clock: quote must be sent within `DEFAULT_SLA_HOURS.quoteResponse` hours
- **What changes:** Order becomes visible to COE queue

#### Stage 3: Pricing (status still `submitted` while pricing is set)
- **Actor:** Admin, COE Manager, or Sales
- **Action:** Click "Edit & Send Quote" on order detail → enter unit prices per item → "Save & Send Quote"
- **API calls:**
  1. `PATCH /api/orders/[id]/items` — save prices to `order_items.unit_price`
  2. `POST /api/orders/[id]/transition` — move to `quoted`
  3. `POST /api/orders/[id]/send-quote-email` — send email with PDF + Excel to customer
- **Pricing logic:**
  - Suggested price pulled from `pricing.service.ts` (market-referenced V2)
  - Market price = blend of Bell, Telus, GoRecell competitor prices
  - COE can override with manual price
  - `pricing_metadata` stores: `pricing_source` (auto/manual), `suggested_by_calc`, competitor context

#### Stage 4: Quoted (status = `quoted`)
- **Customer-facing:** Green banner on `/customer/orders/[id]` — "Quote ready for review"
- **Actor:** Customer
- **Actions available:**
  - Accept → `transition` to `accepted`
  - Decline → `transition` to `rejected`
- **Quote expiry:** `quote_expires_at` field — set when quote is sent
- **Auto-check:** Cron `/api/cron/quote-price-check` monitors if market prices have moved significantly since quoting

#### Stage 5: Accepted (status = `accepted`)
- **Actor:** System (auto after customer clicks Accept)
- **Auto-notifications:**
  - Sales + COE Manager notified
  - Customer receives confirmation email
- **What happens next:** COE needs to arrange shipping label for customer

#### Stage 6: Device Shipping (status = `sourcing` → `sourced` → `shipped_to_coe`)
- **For trade-in:** Customer ships devices to COE
- **Customer action:** Upload tracking via "Ship Devices to Us" button
- **API:** `POST /api/shipments` with `direction: 'inbound'`, tracking number
- **Status transition:** Manual by COE or system when tracking received

#### Stage 7: Received (status = `received`)
- **Actor:** COE Tech (scans/marks packages received)
- **Action:** Transition to `received` when physical devices arrive at COE
- **Shipment:** Inbound shipment updated with `received_at`

#### Stage 8: Triage (status = `triage`)
- **Actor:** COE Tech
- **Action:** Physical device inspection via `/coe/triage`
- **Triage process:**
  1. Verify IMEI against claimed serial (IMEI lookup API)
  2. Battery health check (TestPod API if configured)
  3. Cosmetic grading (10-point checklist in `TRIAGE_CHECKLIST_ITEMS`)
  4. Actual condition grading vs claimed condition
  5. Note any defects from `COMMON_DEVICE_ISSUES` list
- **If condition matches claim:** `POST /api/triage` → status → `triage_complete`
- **If condition mismatch:** `POST /api/triage/[id]/exception` → creates `TriageResult` + `order_exceptions` row
  - Customer notified of discrepancy
  - Customer must approve/reject adjusted amount
  - COE + Admin notified to review exception

#### Stage 9: Exception Handling (status = `triage` while exception pending)
- **Actor:** Customer (approve/reject) + COE Manager (review)
- **Exception approval flow:**
  1. COE flags: `POST /api/orders/[id]/discrepancies/[exId]/approve-coe`
  2. Admin approves: `POST /api/orders/[id]/discrepancies/[exId]/approve-admin`
  3. Customer approves reduced amount: triggers transition
  4. Customer rejects: order may be `rejected`

#### Stage 10: Approved → Closed
- **Status:** `approved` → `closed`
- **Action:** COE marks triage approved; payout processed (outside system)
- **Final:** Status = `closed`, `completed_at` timestamp set

---

## WORKFLOW 2: CPO (Certified Pre-Owned) Order Lifecycle

### Trigger
Customer or Sales creates a CPO order via `/orders/new/cpo`.

### Status Machine
```
draft → submitted → quoted → accepted → sourcing → sourced → shipped → delivered → closed
                                           ↑
                               (vendor bid accepted here)
```

### Step-by-Step

#### Stage 1: Draft → Submitted
Same as Trade-In. CPO order number format: `CPO-YYYYMM-NNNN`.

#### Stage 2: Quoting CPO Devices
- **Pricing source:** `pricing.service.ts` — market CPO price (sell price from competitors)
- **Competitor sell prices:** Bell, Telus, GoRecell, UniverCell
- **Beat competitor:** Price can be set to beat best competitor by configurable %
- **CPO-specific:** Multiple conditions per device supported (e.g., "Excellent", "Good" comparison)
- **Buyback guarantee:** Optional — COE calculates `guaranteed_buyback_price` via depreciation schedule

#### Stage 3: Vendor Sourcing (status = `sourcing`)
- **Actor:** COE Manager / Admin
- **Option A — Direct vendor assignment:**
  - Click "Assign Vendor" dialog → select from vendors list
  - `PATCH /api/orders/[id]` with `vendor_id`
  - Vendor notified via notification + email
- **Option B — Open bid (broadcast to all vendors):**
  - Order remains unassigned in `sourcing` status
  - All vendors see it at `/vendor/orders` and `GET /api/vendors/open-orders`
  - Vendors submit bids: `POST /api/vendors/bids` with `order_id`, `amount`, `notes`, `valid_until`
  - Admin/COE reviews bids in order detail pricing dialog
  - Accept bid: `POST /api/vendors/bids/[id]` with action=accept → assigns vendor, sets price

#### Stage 4: Vendor Fulfillment (status = `sourced` → `shipped`)
- **Actor:** Vendor
- **Action:** Vendor marks order sourced, uploads tracking via `/vendor/orders/[id]`
- **Shipment:** `POST /api/shipments` with direction `outbound` from vendor to customer
- **COE can track:** Shipment visible in order detail

#### Stage 5: Delivery → Closed
- Status: `shipped` → `delivered` → `closed`
- Customer or vendor marks delivered
- COE closes order

---

## WORKFLOW 3: Pricing Calculation

### Market-Referenced Pricing V2

**Formula:**
```
avg_bell_telus = average(Bell.trade_in_price, Telus.trade_in_price)
engine_price = (avg_bell_telus + GoRecell.trade_in_price) / 2
final_price = engine_price × condition_multiplier × margin_adjustment
```

**Condition Multipliers (from constants):**
- `new` / `excellent`: 1.0
- `good`: 0.85
- `fair`: 0.65
- `poor`: 0.45
- `broken`: 0.50

**Risk Modes:**
- `retail` — 20% margin built in
- `enterprise` — 12% margin (bulk customer discount)

**Beat Competitor:**
- `BEAT_COMPETITOR_DEFAULT_PCT` — set in pricing settings
- If set, price is calculated to beat the best competitor by that %

### Price Calculation API

**Single device:** `POST /api/pricing/calculate`
```json
{
  "device_id": "uuid",
  "storage": "128GB",
  "condition": "good",
  "type": "trade_in"
}
```

**Batch (for order):** `POST /api/pricing/calculate-batch`
```json
{
  "items": [{ "device_id": "...", "storage": "...", "condition": "..." }],
  "order_type": "trade_in",
  "customer_id": "..."
}
```

### Auto-Generate Quote

`POST /api/orders/[id]/generate-quote` — runs batch pricing for all order items and saves `unit_price` to each item. COE can then review and adjust before sending.

### Pricing Data Pipeline

```
1. Competitor scrapers run (daily cron or manual trigger)
   → Bell, Telus, GoRecell, UniverCell, Apple
   → Store in competitor_prices table

2. Pricing engine reads competitor_prices
   → Calculates market reference prices
   → Applies condition multipliers + margin

3. Manual price overrides stored in device_last_manual_prices
   → Used as "last manual" reference in pricing dialog

4. Trained pricing baselines (ML)
   → Weekly cron runs pricing-training
   → Updates trained_pricing_baselines table
   → Improves auto-suggest accuracy over time
```

---

## WORKFLOW 4: Competitor Price Scraping

### Trigger Types
1. **Daily cron:** `GET /api/cron/price-scraper` at 2am
2. **Manual:** Admin → Pricing → "Scrape Now" button → `POST /api/pricing/scrape`
3. **Auto on device add:** When new device added to catalog (fire-and-forget)

### Scraping Pipeline (`runScraperPipeline`)

```typescript
runScraperPipeline(
  devices: DeviceToScrape[],    // [{ make, model, storage }]
  supabase: SupabaseClient,
  discovery: boolean,           // full catalog discovery or targeted
  providers?: ScraperProviderId[] // limit to specific competitors
)
```

**Provider Selection:**
- Each provider has an env flag: `SCRAPER_BELL_ENABLED`, etc.
- Each has a mode: `ts` | `scrapling` | `dual`

**TypeScript Adapters (default):**
- Bell: Session-authenticated REST API
- GoRecell: Product catalog HTML parsing
- Apple: Apple Trade-In value calculator
- Universal: Generic web scraping

**Python (Scrapling) Workers:**
- Run as child processes: `spawn(SCRAPLING_PYTHON_BIN, [worker_file])`
- Communicate via stdin/stdout JSON
- Better anti-bot evasion (Camoufox + Patchright TLS fingerprinting)

**Storage:**
- Scraped prices inserted into `competitor_prices` table
- Columns: `device_id`, `competitor_name`, `storage`, `condition`, `trade_in_price`, `sell_price`, `country_code`, `region`, `scraped_at`
- Staleness: `/api/cron/pricing-staleness` flags prices older than `PRICING_STALENESS_DAYS` days

---

## WORKFLOW 5: User Onboarding (Organization Creation)

### Trigger
Admin creates a new Organization (Customer or Vendor type) via `/admin/organizations/new`.

### Flow

```
1. Admin submits: POST /api/organizations
   → OrganizationService.createOrganization()
   → Creates organizations row

2. If type === 'customer':
   → CustomerService.createCustomer() — linked customer record for orders

3. If type === 'vendor':
   → VendorService.createVendor() — linked vendor record for bids

4. UserProvisioningService.provisionUser():
   → assertEmailAvailable() — check email not in use
   → supabase.auth.admin.createUser() — create auth account
   → Insert row in users table with role + organization_id
   → Send welcome email with temporary password / login link

5. Response includes:
   - portal_account_created: boolean
   - welcome_email_sent: boolean
   - welcome_email_sent_to: string
```

### Edge Cases
- If email already exists: returns 400 "Email already in use"
- `oneUserPerRolePerOrganization: true` — skip if org already has a user of that role
- Email delivery failure: logged but does not fail the org creation

---

## WORKFLOW 6: Notification System

### Notification Types
- `in_app` — Bell icon counter + notification center
- `email` — Sent via email service
- `sms` — Sent via Twilio (if configured)

### Trigger Points

| Event | Recipients | Type |
|---|---|---|
| New order submitted | Admin, COE Manager | in_app + email |
| Quote sent to customer | Customer | email (quote email with PDF) |
| Customer accepts/rejects | Sales, COE Manager | in_app |
| Vendor assigned to order | Vendor | in_app + email |
| New CPO bid received | Admin, COE Manager | in_app |
| Bid accepted | Vendor | in_app + email |
| Exception flagged (triage) | Customer, Admin | in_app + email |
| Exception resolved | Customer | in_app + email |
| SLA breach detected | Admin, COE Manager | in_app |
| Order closed | Customer | email |

### Realtime Delivery
- Supabase Realtime subscription on `notifications` table
- `useNotifications()` hook invalidates React Query cache on new notification
- Bell icon count updates without page refresh

---

## WORKFLOW 7: Authentication & Role Routing

### Login Flow
```
1. User enters email + password at /login
2. useAuth.login() → supabase.auth.signInWithPassword()
3. On success:
   - Fetch user profile from users table
   - Store in localStorage cache (5 min TTL)
   - Set cookies: dlm_role, dlm_uid (8 hour TTL)
4. redirect to getDefaultAppPathForRole(role)
   - customer/vendor → /customer/orders
   - everything else → /dashboard
```

### Middleware Route Guard (`src/proxy.ts`)
```
Every request:
1. Check if public route → allow
2. Read dlm_role + dlm_uid cookies
3. If cookies present → fast path (no DB call)
   - Check role has permission for this path
   - If yes → allow, If no → redirect to /login or /dashboard
4. If no cookies → slow path
   - Call supabase.auth.getUser()
   - Fetch users.role from DB
   - Set cookies for future requests
   - Apply route rules
```

### Role → Default Path
| Role | Default Path |
|---|---|
| admin | /dashboard |
| coe_manager | /dashboard |
| coe_tech | /dashboard |
| sales | /dashboard |
| customer | /customer/orders |
| vendor | /vendor/orders |

### Dual-Role Switching
- `users.secondary_role` column (optional)
- `dlm_active_role` cookie stores the current active role
- `useAuth.switchRole(targetRole)` — validates role, sets cookie, navigates to default path
- `useAuth.hasRole(role)` — checks both primary and active role
- Header shows "Switch to [Role] View" button if `user.secondary_role` exists
- All API routes use `effectiveRole` from `requireAuth()` for data scoping

---

## WORKFLOW 8: Triage Inspection

### Trigger
COE Tech receives physical devices and begins inspection.

### Flow
```
1. COE Tech navigates to /coe/triage
2. Finds order by order number or IMEI
3. For each device:
   a. IMEI lookup: GET /api/imei/{imei}
      → Carrier lock status, model verification
   b. Battery health: GET /api/testpod/lookup?imei={imei}
      → Battery capacity % (TestPod API)
   c. Physical inspection using TRIAGE_CHECKLIST_ITEMS:
      - Screen condition (scratches, cracks, dead pixels)
      - Body condition (dents, scuffs)
      - Buttons functioning
      - Ports working
      - Speaker/mic working
      - Camera working
      - Battery health visual
      - Software reset confirmed
      - Accessories included
      - Charger included
   d. Grade device: new/excellent/good/fair/poor/broken
   e. Note any defects from COMMON_DEVICE_ISSUES list

4. If graded condition matches claimed condition:
   → POST /api/triage → transition to triage_complete

5. If graded condition WORSE than claimed:
   → POST /api/triage/[id]/exception
   → Creates TriageResult with discrepancy details
   → Customer notified: "Your device's condition differs from what was claimed"
   → Adjusted price offered

6. Customer approves/rejects exception via /customer/orders/[id]
   → Exception approved: order continues with adjusted price
   → Exception rejected: order may be cancelled or escalated
```

---

## WORKFLOW 9: SLA Management

### SLA Rules
Configured in Admin → SLA Rules (`/admin/sla-rules`).

**Default SLA hours (`DEFAULT_SLA_HOURS` in constants.ts):**
- Quote response: 24h from submission
- Customer response to quote: 72h
- Sourcing: 48h after acceptance
- Triage: 24h after receipt
- Shipping: 48h after sourcing

### SLA Check Cron
`/api/cron/sla-check` runs every 30 minutes:
1. Query orders where `status` requires action within SLA window
2. Check if deadline has passed
3. If breached: insert `sla_breaches` row, notify Admin + COE Manager

### SLA Breach Indicators
- `is_sla_breached` flag on order
- Red "SLA Breached" badge in order list + detail
- Notification: "Order TI-202605-0001 has breached SLA for quoting"

---

## WORKFLOW 10: Vendor Bid Management

### Open Bid Discovery (CPO only)
```
1. Admin/COE creates CPO order, leaves vendor unassigned, transitions to 'sourcing'
2. All vendors see this at GET /api/vendors/open-orders
   - Filtered: type='cpo', vendor_id IS NULL, status IN ('submitted','accepted','sourcing')
   - Data sanitized: sanitizeOrderForVendor() removes customer PII + pricing details

3. Vendor submits bid: POST /api/vendors/bids
   { order_id, amount, notes, valid_until }

4. Admin/COE reviews bids in order detail → pricing dialog → "Vendor Bids" section

5. Admin accepts bid: POST /api/vendors/bids/[id] (action=accept)
   → vendor_id set on order
   → vendor notified
   → other bids auto-rejected

6. Bid expiry: /api/cron/bid-expiry marks bids past valid_until as expired
```

### Vendor-Safe Data (sanitizeOrderForVendor)
Vendors receive orders with:
- ✓ Device specifications (make, model, condition, storage)
- ✓ Quantity
- ✓ Order number
- ✗ Customer name/contact (removed)
- ✗ Pricing details (removed)
- ✗ Internal notes (removed)

---

## DATABASE SCHEMA OVERVIEW

### Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | Auth users with roles | id, role, secondary_role, organization_id, is_active, notification_email |
| `organizations` | Companies (customers/vendors/internal) | id, name, type, address, contact_email |
| `customers` | Linked customer records | id, organization_id, company_name, contact_email, billing_address, shipping_address, default_risk_mode |
| `vendors` | Linked vendor records | id, organization_id, company_name, contact_email, address |
| `device_catalog` | Device SKU registry | id, make, model, variant, category, sku, specifications (JSON) |
| `orders` | Order header | id, order_number, type, status, customer_id, vendor_id, total_amount, quoted_amount, direction |
| `order_items` | Line items | id, order_id, device_id, quantity, storage, condition, unit_price, pricing_metadata (JSON), imei, serial_number |
| `competitor_prices` | Scraped market prices | id, device_id, competitor_name, storage, condition, trade_in_price, sell_price, scraped_at |
| `pricing_tables` | Internal pricing config | id, device_id, storage, condition, base_price, margin_pct |
| `pricing_settings` | Global pricing config | id, beat_competitor_pct, ceiling_enabled, training_enabled |
| `trained_pricing_baselines` | ML model data | id, device_id, storage, condition, baseline_price, confidence |
| `shipments` | Tracking records | id, order_id, direction, carrier, tracking_number, status |
| `triage_results` | COE inspection data | id, order_item_id, graded_condition, battery_health, checklist_json |
| `order_exceptions` | Discrepancies | id, order_id, order_item_id, exception_type, claimed_condition, actual_condition, adjustment_amount |
| `notifications` | User alerts | id, user_id, type, title, message, is_read, link |
| `audit_logs` | System audit trail | id, user_id, action, resource_type, resource_id, metadata |
| `sla_rules` | SLA configuration | id, status, max_hours, priority |
| `sla_breaches` | Breach records | id, order_id, rule_id, breached_at |
| `vendor_bids` | CPO bids | id, order_id, vendor_id, amount, status, valid_until |
| `order_splits` | Split order tracking | id, parent_order_id, child_order_id |
| `device_last_manual_prices` | Per-device manual price history | id, device_id, storage, condition, price, set_by, set_at |

### RLS Policies Summary
- Users can only read/write their own data
- Customers: scoped to their `organization_id`
- Vendors: scoped to their `organization_id`; open CPO orders visible read-only
- Internal roles: full access (enforced at API layer, not just RLS)
- Service role client bypasses RLS (used in server-side services only)
