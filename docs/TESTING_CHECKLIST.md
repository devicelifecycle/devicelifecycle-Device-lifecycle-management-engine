# Manual Testing Checklist — DLM Engine

> **Purpose**: Exhaustive manual testing checklist for human testers.  
> Use checkboxes `[ ]` to mark items as tested. Replace with `[x]` when complete.

---

## 1. Pre-requisites

- [ ] Run `npm run seed-test-users` (internal users; all password: `Test123!`)
- [ ] Run `npm run seed-acme` (Acme Corporation org login)
- [ ] Run `npm run dev` to start the application
- [ ] **Use organization logins** — no standalone user page; always log in via organization:
  - Internal: admin, coemgr, coetech, sales
  - Customer: `acme` (Acme Corp) — prefer over generic `customer`
  - Vendor: use org-linked vendor if available

---

## 2. Authentication

### Login
- [ ] Login with valid credentials (e.g. Login ID `admin` / `Test123!`)
- [ ] Login with invalid email → error shown
- [ ] Login with invalid password → error shown
- [ ] Login with empty fields → validation prevents submit
- [ ] "Forgot password?" link navigates to `/forgot-password`
- [ ] "Request access" / Register link navigates to `/register`
- [ ] Show/hide password toggle works
- [ ] After successful login → redirects to dashboard (or `?redirect` path if present)

### Logout
- [ ] Logout from sidebar (user section, LogOut icon)
- [ ] After logout → redirected to login
- [ ] Session cleared; protected routes require re-login

### Forgot Password
- [ ] Navigate to `/forgot-password`
- [ ] Submit valid email → success message "Check your email"
- [ ] Submit invalid/non-existent email → still shows success (no user enumeration)
- [ ] "Back to Sign In" link works
- [ ] Email contains reset link (requires SMTP/resend configured)

### Reset Password
- [ ] Open reset link from email → lands on `/reset-password`
- [ ] Expired/invalid link → redirects to `/forgot-password`
- [ ] Password too weak → validation error (12+ chars, upper, lower, number, special)
- [ ] Password and confirm mismatch → error shown
- [ ] Valid password → success, redirect to login
- [ ] Show/hide password toggle works

### Register (if applicable)
- [ ] Register page exists at `/register`
- [ ] Shows "Request Access" message (self-registration disabled; users created by admins)
- [ ] "Back to Sign In" button works
- [ ] No functional registration form (enterprise-controlled access)

### Session Expiry Handling
- [ ] When session expires, protected route redirects to login
- [ ] `?reason=session_expired` on login shows session expired message
- [ ] Landing page (`/`) redirects authenticated users to `/dashboard`

---

## 3. Role-Based Access

> Middleware enforces: `/admin` = admin only; `/coe` = admin, coe_manager, coe_tech;  
> `/customer/` = customer only; `/vendor/` = vendor only;  
> `/customers`, `/vendors` = admin, coe_manager, sales;  
> `/orders/new` = admin, coe_manager, coe_tech, sales, customer;  
> `/orders` = all roles; `/devices`, `/reports` = admin, coe_manager.

### Admin
- [ ] **SHOULD access**: `/`, `/dashboard`, `/notifications`, `/orders`, `/orders/new/trade-in`, `/orders/new/cpo`, `/orders/[id]`, `/customers`, `/customers/new`, `/customers/[id]`, `/vendors`, `/vendors/new`, `/vendors/[id]`, `/devices`, `/coe/receiving`, `/coe/triage`, `/coe/exceptions`, `/coe/shipping`, `/reports`, `/admin/organizations`, `/admin/pricing`, `/admin/sla-rules`, `/admin/users`, `/admin/audit-log`, `/profile`
- [ ] **Should NOT access**: `/customer/orders`, `/customer/requests`, `/vendor/orders` (or gets 403/redirect)
- [ ] **Sidebar**: Dashboard, Notifications, Orders, Customers, Vendors, Devices, COE (Receiving, Triage, Exceptions, Shipping), Reports, Administration (all items), Profile

### COE Manager
- [ ] **SHOULD access**: Same as admin minus `/admin/*`; plus `/coe/*`, `/customers`, `/vendors`, `/devices`, `/reports`
- [ ] **Should NOT access**: `/admin/*`, `/customer/orders`, `/customer/requests`, `/vendor/orders`
- [ ] **Sidebar**: Dashboard, Notifications, Orders, Customers, Vendors, Devices, COE (all), Reports, Profile

### COE Tech
- [ ] **SHOULD access**: `/dashboard`, `/notifications`, `/orders`, `/orders/new/trade-in`, `/orders/new/cpo`, `/coe/receiving`, `/coe/triage`, `/coe/shipping`, `/profile`
- [ ] **Should NOT access**: `/admin/*`, `/customers`, `/vendors`, `/devices`, `/reports`, `/coe/exceptions`, `/customer/`, `/vendor/`
- [ ] **Sidebar**: Dashboard, Notifications, Orders, COE (Receiving, Triage, Shipping — no Exceptions), Profile

### Sales
- [ ] **SHOULD access**: `/dashboard`, `/notifications`, `/orders`, `/orders/new/trade-in`, `/orders/new/cpo`, `/customers`, `/customers/new`, `/customers/[id]`, `/vendors`, `/vendors/new`, `/vendors/[id]`, `/profile`
- [ ] **Should NOT access**: `/admin/*`, `/devices`, `/reports`, `/coe/*`, `/customer/`, `/vendor/`
- [ ] **Sidebar**: Dashboard, Notifications, Orders, Customers, Vendors, Profile

### Customer
- [ ] **SHOULD access**: `/dashboard`, `/notifications`, `/orders`, `/orders/new/trade-in`, `/customer/orders`, `/customer/requests`, `/orders/[id]` (own only), `/profile`
- [ ] **Should NOT access**: `/admin/*`, `/coe/*`, `/customers`, `/vendors`, `/devices`, `/reports`, `/orders/new/cpo`, `/vendor/`
- [ ] **Sidebar**: Dashboard, Notifications, Orders, My Orders, Requests, Profile

### Vendor
- [ ] **SHOULD access**: `/dashboard`, `/notifications`, `/orders`, `/vendor/orders`, `/orders/[id]` (assigned only), `/profile`
- [ ] **Should NOT access**: `/admin/*`, `/coe/*`, `/customers`, `/vendors`, `/devices`, `/reports`, `/orders/new/*`, `/customer/`
- [ ] **Sidebar**: Dashboard, Notifications, Orders, Vendor Orders, Profile

### Route Protection (403/Redirect)
- [ ] Admin visits `/customer/orders` → redirect to `/` (or appropriate page)
- [ ] Sales visits `/admin/organizations` → redirect to `/`
- [ ] Vendor visits `/coe/receiving` → redirect to `/`
- [ ] Customer visits `/customers` → redirect to `/`
- [ ] Unauthenticated visit to `/dashboard` → redirect to `/login?redirect=/dashboard`

---

## 4. Features by Section

### Dashboard
- [ ] Page loads at `/dashboard`
- [ ] Stat cards: Total Orders, Pending, (internal) SLA Alerts, (internal) Revenue
- [ ] Order Trend chart (7 days) — internal roles only
- [ ] Order Pipeline chart — internal roles only
- [ ] Quick Actions: View All Orders, (internal) New Order, (admin/coe_manager/sales) Add Customer, Add Vendor, (customer) Notifications
- [ ] Recent Orders list; click order → order detail
- [ ] Activity Feed — internal roles only
- [ ] New Trade-In / New CPO buttons — internal roles
- [ ] Empty state when no orders
- [ ] All links and buttons work

### Orders

#### List (`/orders`)
- [ ] Orders table displays
- [ ] Search by order number, customer, or vendor
- [ ] Status filter dropdown (All, Draft, Submitted, Quoted, etc.)
- [ ] Type filter dropdown (All, Trade-In, CPO)
- [ ] Clear filters button
- [ ] Pagination
- [ ] Row checkbox select
- [ ] Select all checkbox
- [ ] Bulk action bar when selected: Move to status, Export CSV, (admin) Bulk Delete
- [ ] New Trade-In button (internal + customer)
- [ ] New CPO button (internal only)
- [ ] Click order number → order detail
- [ ] Empty state

#### Create Trade-In (`/orders/new/trade-in`)
- [ ] Form loads
- [ ] Customer select (internal) / auto-filled (customer)
- [ ] Device selection, quantity, condition, storage
- [ ] Add line items
- [ ] Notes field
- [ ] Submit creates draft order
- [ ] Redirect to order detail

#### Create CPO (`/orders/new/cpo`)
- [ ] Form loads
- [ ] Customer and vendor selection
- [ ] Device selection, quantity, specifications
- [ ] Submit creates draft order

#### Order Detail (`/orders/[id]`)
- [ ] Order header: number, type badge, status badge, SLA Breached badge
- [ ] Customer/Vendor info
- [ ] Line items table with expandable details (IMEI, metadata, pricing context)
- [ ] Notes (customer + internal)
- [ ] Shipments section (if any)
- [ ] Sub-orders section (split orders)
- [ ] Download Quote/Invoice PDF
- [ ] Set Pricing (admin, coe_manager) — opens dialog
- [ ] Send Quote (admin, coe_manager) — when prices set, moves to quoted
- [ ] Split Across Vendors (sourcing only, admin/coe_manager)
- [ ] Status transitions: Move to [status] with optional notes
- [ ] Customer: Accept Quote / Reject Quote when quoted
- [ ] Timeline shows key dates
- [ ] Suggest Price (trade-in only) in pricing dialog
- [ ] Market context / competitor prices in pricing dialog

#### Send Quote
- [ ] Prices set → Send Quote enabled
- [ ] Draft → auto-submit then quoted
- [ ] Quote sent → order status = Quoted

#### Accept / Reject (Customer)
- [ ] When quoted, Accept Quote visible
- [ ] Accept → moves to Accepted
- [ ] Reject → moves to Rejected
- [ ] Confirmation dialog for both

#### Status Transitions
- [ ] draft → submitted, cancelled
- [ ] submitted → quoted, cancelled
- [ ] quoted → accepted, rejected
- [ ] accepted → sourcing, cancelled
- [ ] sourcing → sourced, cancelled
- [ ] sourced → shipped_to_coe, cancelled
- [ ] shipped_to_coe → received
- [ ] received → in_triage
- [ ] in_triage → qc_complete
- [ ] qc_complete → ready_to_ship
- [ ] ready_to_ship → shipped
- [ ] shipped → delivered
- [ ] delivered → closed

#### Order Split (`/orders/[id]/split`)
- [ ] Page loads for sourcing order
- [ ] Assign items to vendors
- [ ] Split creates sub-orders

### Customers
- [ ] List at `/customers`: search, pagination, table
- [ ] New Customer at `/customers/new`: form, create
- [ ] Detail at `/customers/[id]`: view, edit link
- [ ] Edit customer
- [ ] Create order for customer

### Vendors
- [ ] List at `/vendors`: search, status filter (all/active/inactive), pagination
- [ ] New Vendor at `/vendors/new`
- [ ] Detail at `/vendors/[id]`
- [ ] Edit vendor

### COE — Receiving
- [ ] Page loads at `/coe/receiving`
- [ ] Inbound shipments list
- [ ] Search shipments
- [ ] Record Inbound Shipment: search order, add carrier + tracking
- [ ] Mark as Received
- [ ] Receive dialog with notes

### COE — Triage
- [ ] Page loads at `/coe/triage`
- [ ] Pending items list
- [ ] Search
- [ ] Open triage for item: checklist (power on, touch, display, speakers, etc.), physical condition, screen condition, battery health, issues, notes
- [ ] Submit triage → item moves to next state
- [ ] Raise exception (condition mismatch)

### COE — Exceptions
- [ ] Page loads at `/coe/exceptions`
- [ ] Exceptions list (condition mismatches)
- [ ] Search
- [ ] Approve / Reject with notes
- [ ] Pending count badge

### COE — Shipping
- [ ] Page loads at `/coe/shipping`
- [ ] Tabs: Outbound, All Shipments
- [ ] Create outbound shipment: order search, carrier, tracking, Shippo purchase toggle, dimensions
- [ ] Update shipment status
- [ ] Exception details for exception status
- [ ] Shippo health indicator

### Devices
- [ ] List at `/devices`: search, make filter, category filter, pagination
- [ ] Add device dialog: make, model, variant, category, SKU, storage options, colors
- [ ] Create device
- [ ] Device detail page `/devices/[id]`

### Reports
- [ ] Page loads at `/reports`
- [ ] Order stats: total, by status, by type, revenue, avg value
- [ ] Shipping stats: inbound, outbound, delivered, in transit, exceptions, avg delivery days
- [ ] Charts render
- [ ] Filters if any

### Admin — Organizations
- [ ] List at `/admin/organizations`
- [ ] Search
- [ ] Create organization
- [ ] Edit organization
- [ ] Type: internal, customer, vendor

### Admin — Pricing
- [ ] Page loads at `/admin/pricing`
- [ ] Tabs: Competitor Prices, Calculator, Settings
- [ ] Competitor: add/edit/delete prices, device search, condition filter, scrape
- [ ] Calculator: device, storage, condition, risk mode → suggested price
- [ ] Settings: margin tiers, risk modes
- [ ] Benchmark apply (percent/fixed, increase/decrease)
- [ ] Export competitors

### Admin — SLA Rules
- [ ] List at `/admin/sla-rules`
- [ ] Create rule
- [ ] Edit rule
- [ ] Delete rule

### Admin — Users
- [ ] List at `/admin/users`
- [ ] Create user: name, email, role, password
- [ ] Edit user: name, role
- [ ] Deactivate/activate user

### Admin — Audit Log
- [ ] Page loads at `/admin/audit-log`
- [ ] Log entries display
- [ ] Filters (if any)

### Notifications
- [ ] List at `/notifications`
- [ ] Unread count in header
- [ ] Mark single as read (click)
- [ ] Mark all as read
- [ ] Pagination
- [ ] Empty state

### Profile
- [ ] View at `/profile`
- [ ] Full name, email, role, last login
- [ ] Edit full name
- [ ] Save changes
- [ ] Cancel edit
- [ ] Account status, member since

---

## 5. Toggles and UI

### Dark / Light Mode
- [ ] Theme toggle in header (Sun/Moon icon)
- [ ] Toggle switches between dark and light
- [ ] Theme persists across refresh (next-themes)

### Sidebar
- [ ] Section collapse: Overview, Operations, COE, Analytics, Administration — click to expand/collapse
- [ ] Active nav item highlighted
- [ ] Mobile: hamburger opens sidebar overlay
- [ ] Mobile: click overlay closes sidebar
- [ ] Profile link in sidebar footer
- [ ] Logout button in sidebar

### Form Controls
- [ ] Select dropdowns work (status, type, carrier, role, etc.)
- [ ] Checkboxes (bulk select, triage checklist)
- [ ] Switch toggles (Shippo purchase, etc.) work
- [ ] Date pickers if any
- [ ] Input validation (required, format)

---

## 6. Critical User Flows

### Full Order Flow (Internal User)
- [ ] Create trade-in order → draft
- [ ] Set pricing (suggest or manual) → save
- [ ] Send Quote → quoted
- [ ] (As customer) Accept Quote → accepted
- [ ] Transition to Sourcing
- [ ] (Optional) Split order across vendors
- [ ] Sub-orders sourced → shipped_to_coe
- [ ] COE Receiving: record shipment, mark received
- [ ] Triage: complete checklist, submit
- [ ] (If exception) Exceptions: approve or reject
- [ ] Shipping: create outbound, update status
- [ ] Delivered → Closed

### Customer Flow
- [ ] Login as customer (use `acme` — Acme Corp org login)
- [ ] Go to Requests → New Trade-In Request
- [ ] Create request (draft)
- [ ] Submit → submitted
- [ ] Wait for quote (internal sends quote)
- [ ] My Orders: view quoted order
- [ ] Order detail: Accept or Reject
- [ ] Accept → order moves to Accepted
- [ ] Track order status in My Orders

### Vendor Flow
- [ ] Login as vendor (use org-linked vendor login)
- [ ] Vendor Orders: view assigned orders
- [ ] Order detail: view items, fulfill (if applicable)
- [ ] Confirm shipment / status updates

---

## 7. Edge Cases and Error Handling

- [ ] Invalid order ID → 404 / not found message
- [ ] Invalid customer/vendor ID → error handling
- [ ] Network error → toast or error message
- [ ] Concurrent edits → last write or conflict handling
- [ ] Empty lists show appropriate empty states
- [ ] Long text truncates appropriately
- [ ] Pagination at last page behaves correctly

---

## 8. Cross-Browser / Responsive (Optional)

- [ ] Desktop (Chrome, Firefox, Safari)
- [ ] Mobile viewport
- [ ] Tablet viewport
- [ ] Sidebar responsive on mobile

---

*Last updated: March 2026*
