# Login Types Verification Guide

Manual checklist to verify all login types and their role-based access.

**Password for all: `Test123!`**

**Setup:** Run `npm run seed-test-users` and `npm run seed-org-customer` before testing.

---

## 1. Admin (`admin`)

| Login ID | Password   | Expected sidebar |
|----------|------------|------------------|
| admin    | Test123!   | Dashboard, Notifications, Orders, Customers, Vendors, Devices, COE (Receiving, Triage, Exceptions, Shipping), Reports, Administration (Organizations, Pricing, SLA Rules, Users, Audit Log), Profile |

**Verify:**
- [ ] Can access `/admin/users` – User management
- [ ] Can access `/admin/pricing` – Pricing settings, competitor data
- [ ] Can access `/admin/organizations` – Org management
- [ ] Can access `/devices` – Device catalog
- [ ] Can access `/coe/receiving`, `/coe/triage`, `/coe/exceptions`, `/coe/shipping`
- [ ] Can access `/reports`
- [ ] No 403 or redirect to login

---

## 2. CoE Manager (`coemgr`)

| Login ID | Password   | Expected sidebar |
|----------|------------|------------------|
| coemgr   | Test123!   | Dashboard, Notifications, Orders, Customers, Vendors, Devices, COE (Receiving, Triage, Exceptions, Shipping), Reports, Profile |

**Verify:**
- [ ] Can access `/coe/receiving`, `/coe/triage`, `/coe/exceptions`, `/coe/shipping`
- [ ] Can access `/devices`, `/reports`, `/customers`, `/vendors`, `/orders`
- [ ] Cannot access `/admin/users` – redirected away (403 or redirect)
- [ ] Cannot access `/admin/pricing`, `/admin/organizations` – no Administration section

---

## 3. CoE Tech (`coetech`)

| Login ID | Password   | Expected sidebar |
|----------|------------|------------------|
| coetech  | Test123!   | Dashboard, Notifications, Orders, COE (Receiving, Triage, Shipping), Profile |

**Verify:**
- [ ] Can access `/coe/receiving`, `/coe/triage`, `/coe/shipping`
- [ ] Can access `/orders`
- [ ] Cannot access `/coe/exceptions` – CoE Manager only
- [ ] Cannot access `/admin/users`, `/devices`, `/reports`, `/customers`, `/vendors` – redirected or 403
- [ ] No Devices, Customers, Vendors, Reports, Administration in sidebar

---

## 4. Sales (`sales`)

| Login ID | Password   | Expected sidebar |
|----------|------------|------------------|
| sales    | Test123!   | Dashboard, Notifications, Orders, Customers, Vendors, Profile |

**Verify:**
- [ ] Can access `/orders`, `/customers`, `/vendors`
- [ ] Cannot access `/admin/users`, `/coe/receiving`, `/devices`, `/reports`
- [ ] No COE, Reports, Administration, Devices in sidebar

---

## 5. Customer – generic (`customer`)

| Login ID | Password   | Expected sidebar |
|----------|------------|------------------|
| customer | Test123!   | Dashboard, Notifications, My Orders, Requests, Profile |

**Verify:**
- [ ] Visiting `/orders` redirects to `/customer/orders`
- [ ] Can access `/customer/orders`, `/customer/requests`, `/customer/notifications`
- [ ] Cannot access `/admin/*`, `/customers`, `/vendors`, `/coe/*`, `/devices`, `/reports`
- [ ] Sees “My Orders” and “Requests”, not “Orders” or “Customers”

---

## 6. Org-linked customer (`customer-org`)

| Login ID | Password   | Expected sidebar |
|----------|------------|------------------|
| customer-org | Test123!   | Same as customer: My Orders, Requests, Notifications, Profile |

**Verify:**
- [ ] Run `npm run seed-org-customer` first
- [ ] Can access `/customer/orders`, `/customer/requests`
- [ ] Cannot access `/admin/*`, `/customers`, `/vendor/orders`, `/orders` (internal)
- [ ] Has org context (customer org)

---

## 7. Vendor (`vendor`)

| Login ID | Password   | Expected sidebar |
|----------|------------|------------------|
| vendor   | Test123!   | Dashboard, Notifications, Vendor Orders, Profile |

**Verify:**
- [ ] Can access `/vendor/orders`
- [ ] Cannot access `/admin/*`, `/customers`, `/coe/*`, `/orders` (internal)
- [ ] Sees “Vendor Orders” only in Operations

---

## Automated E2E Tests

Run role-based access tests:

```bash
# Ensure dev server is running on port 3000
npm run dev

# In another terminal (playwright uses reuseExistingServer)
npm run test:e2e tests/e2e/role-access.spec.ts
```

First-time setup: `npx playwright install` (Chromium).

---

## Quick Reference

| Role        | Login ID | Key pages                             | Blocked        |
|-------------|----------|----------------------------------------|----------------|
| Admin       | admin    | All (admin, COE, devices, reports)    | —              |
| CoE Manager | coemgr   | COE, devices, reports, orders         | Admin section  |
| CoE Tech    | coetech  | COE Receiving/Triage/Shipping, orders | Exceptions, admin, devices |
| Sales       | sales    | Orders, customers, vendors            | Admin, COE, devices |
| Customer    | customer | My Orders, Requests                   | Internal pages |
| Customer Org| customer-org | My Orders, Requests                | Internal pages |
| Vendor      | vendor   | Vendor Orders                         | Internal pages |
