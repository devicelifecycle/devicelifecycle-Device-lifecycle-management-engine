# Demo Flow: Order, Triage & Exception

This guide shows how to run a full demo of order creation, triage, and exception handling — and confirm the org-linked customer sees notifications and order details.

## Prerequisites

1. **Seed org-linked customer** (creates login):
   ```bash
  npm run seed-org-customer
   ```
  - Login: `customer-org` or `customer-org@login.local`  
   - Password: `Test123!`

2. **Seed demo data** (order + triage + exception for org-linked customer):
   ```bash
   node --env-file=.env.local scripts/seed-demo-order-triage.mjs
   ```
  Creates: 1 trade-in order for the org-linked customer, 1 IMEI record, 1 triage result with pending exception.

## Demo Steps

### 1. Admin: View triage & exception

- Login as **admin** / `Test123!`
- Go to **COE → Triage**  
  - Pending items show **Created by** (order creator) when from an order
- Go to **COE → Exceptions**  
  - Pending exceptions show **Triaged by** (who performed inspection)  
  - Click **Approve** or **Reject** to resolve

When you approve/reject, the customer receives a notification and can see the updated order.

### 2. Customer: View notification & order

- Log out
- Login as **customer-org** / `Test123!`
- Go to **Notifications** (bell icon)  
  - See "Exception Approved — Order ORD-DEMO-XXX" (or Rejected)
- Go to **My Orders**  
  - Open the order with the exception  
  - View order details, line items, and triage status

### 3. Admin: Confirm customer context

- Login as **admin** / `Test123!`
- Go to **Customers**
- Open the org-linked customer record
- Use the **"View as customer"** callout: log in as `customer-org` to see Notifications and My Orders

## Data created

| Entity            | Details |
|-------------------|---------|
| Order             | Trade-in, status `received` |
| Order item        | Claimed Excellent, quoted $500 |
| IMEI record       | `triage_status: needs_exception` |
| Triage result     | Actual Good, −$50 adjustment, needs approval |

## URLs

- Orders: `/orders`
- Order detail: `/orders/[id]`
- COE Triage: `/coe/triage`
- COE Exceptions: `/coe/exceptions`
- Customer: `/customers/[customer-org-id]`
- Customer Notifications: `/notifications` (when logged in as customer)
- Customer My Orders: `/customer/orders`
