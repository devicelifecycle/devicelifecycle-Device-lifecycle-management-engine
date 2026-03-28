# Role-by-Role Demo Guide

Use this guide to log in as each role and explore their functions. **App URL:** http://localhost:3001 (or 3000 if not in use)  
**Password for all:** `Test123!`

---

## 1. Admin (`admin`)

**Access:** Full system access

| Section | What to do |
|---------|------------|
| **Dashboard** | See Total Orders, SLA Alerts, Revenue stats; Order Trend & Pipeline charts; Activity Feed |
| **Orders** | View all orders; bulk transition, export CSV, bulk delete (draft/cancelled); create Trade-In or CPO |
| **Customers** | Browse customers, create new |
| **Vendors** | Browse vendors, create new |
| **Devices** | Manage device catalog |
| **COE** | **Receiving** (receive shipments), **Triage** (inspect devices, flag exceptions), **Exceptions** (approve/reject), **Shipping** |
| **Reports** | View analytics |
| **Admin** | **Organizations**, **Pricing** (calculator), **SLA Rules**, **Users**, **Audit Log** |

**Quick test:** Login → Dashboard → click **Orders** → see bulk actions bar when rows selected.

---

## 2. CoE Manager (`coemgr`)

**Access:** COE operations + reports + exceptions

| Section | What to do |
|---------|------------|
| **Dashboard** | Same internal view as admin (minus some admin-only stats) |
| **Orders** | View, bulk transition, create |
| **Customers** | View, manage |
| **Vendors** | View, manage |
| **Devices** | View, manage |
| **COE** | **Receiving**, **Triage**, **Exceptions**, **Shipping** |
| **Reports** | View analytics |

**Quick test:** Login → **COE** → **Exceptions** → approve or reject pending exceptions.

---

## 3. CoE Tech (`coetech`)

**Access:** COE operational tasks

| Section | What to do |
|---------|------------|
| **Dashboard** | Internal view |
| **Orders** | View orders (assigned focus) |
| **COE** | **Receiving**, **Triage** (submit triage results), **Shipping** |
| **NO** | Exceptions (manager-only), Admin, Reports |

**Quick test:** Login → **COE** → **Triage** → open a pending device → submit triage (pass or flag exception).

---

## 4. Sales (`sales`)

**Access:** Orders, customers, create orders

| Section | What to do |
|---------|------------|
| **Dashboard** | Internal view |
| **Orders** | View, bulk actions, create Trade-In/CPO |
| **Customers** | View |
| **Vendors** | View |
| **NO** | COE pages (Receiving, Triage, Exceptions, Shipping), Admin, Devices |

**Quick test:** Login → **Orders** → **New Trade-In** → create an order for a customer.

---

## 5. Customer (`acme`)

**Access:** Their organization’s orders only

| Section | What to do |
|---------|------------|
| **Dashboard** | My Orders, Pending (simplified stats) |
| **My Orders** | View org orders; click order for details |
| **Notifications** | Order updates, exceptions, device review |
| **Order detail** | Accept/reject quote (when quoted); approve/reject device condition when there’s an exception |
| **NO** | Orders (internal list), COE, Admin, Customers, Vendors, Devices |

**Quick test:** Login → **My Orders** → open order **ORD-DEMO-NU3L85** → if there are pending exceptions, use Approve/Reject on each device.

---

## Summary Table

| Role   | Orders | Customers | Vendors | COE | Admin | Exceptions Approve |
|--------|--------|-----------|---------|-----|-------|--------------------|
| Admin  | ✓ Full | ✓         | ✓       | ✓   | ✓     | ✓                  |
| CoE Mgr| ✓ Full | ✓         | ✓       | ✓   | ✗     | ✓                  |
| CoE Tech| ✓ View| ✗         | ✗       | ✓ (no Exceptions) | ✗ | ✗ |
| Sales  | ✓ Full | ✓         | ✓       | ✗   | ✗     | ✗                  |
| Customer| My Orders only | ✗ | ✗ | ✗ | ✗ | ✓ (own orders) |

---

## Setup Before Demos

```bash
npm run dev
npm run seed-test-users   # admin, coemgr, coetech, sales
npm run seed-acme        # acme customer
```

Then go to http://localhost:3001/login (or :3000) and use each Login ID with `Test123!`.
