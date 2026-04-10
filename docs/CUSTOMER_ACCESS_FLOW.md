# Customer Access Flow — How Customers Log In & Use the App

This doc explains how customers get access, log in, and perform actions (create orders, view orders, accept quotes, track shipments).

---

## Overview

Customers **always log in through their organization**. A customer user must be linked to an organization, and that organization must have a Customer record. Without this chain (Organization → Customer → User), the customer cannot create or see orders.

---

## 1. Setup (Admin Does This)

### A. Create or use an Organization (type: customer)

- Go to **Admin → Organizations**
- Create a new organization with type **customer** (e.g. "Acme Corporation")
- Or use an existing customer org

### B. Create or link Customer record

- Go to **Customers → New Customer** (or edit existing)
- Enter company details, contact, addresses
- **Link to Organization** — select the org from step A
- Save

### C. Create user for that organization

- Go to **Admin → Users → Add User**
- **Login ID**: e.g. `customer-org` (user will sign in with this or `customer-org@login.local`)
- **Full Name**: e.g. "Acme Corporation"
- **Role**: `customer`
- **Organization**: select the same org from step A
- **Password**: set initial password (user can change in Profile)
- **Notification Email**: optional — sends welcome email with credentials

### D. Share credentials with the customer

- **If you used a real email** (e.g. john@acme.com): Credentials are automatically emailed to that address. The user logs in with that email.
- **If you used a Login ID** (e.g. customer-org): You must provide "Email to send credentials." Credentials are emailed there. The user logs in with the Login ID (or customer-org@login.local).
- User can change their password in **Profile** or use **Forgot password** (supports both email and Login ID).

---

## 2. Customer Logs In

1. Go to **`/login`**
2. Enter **Login ID** (e.g. `customer-org`) — or full email `customer-org@login.local`
3. Enter **password**
4. Click **Sign In**
5. Redirected to **Dashboard**

---

## 3. What Customers Can Do After Login

| Action | Where | How |
|--------|-------|-----|
| **Create order** | Requests → New Trade-In Request | Create draft, add items, submit |
| **View their orders** | My Orders | See all orders for their organization |
| **Accept or reject quote** | Order detail | Open order → Approve or Disapprove |
| **Track shipment** | Order detail | "Track Your Shipment" section with tracking links |
| **View order status** | My Orders / Order detail | Status badge (draft, submitted, quoted, accepted, etc.) |
| **Edit profile / change password** | Profile | Sidebar → Profile |

---

## 4. How Data Is Scoped

- **Orders**: Customer users only see orders for customers linked to their organization. The system uses `organization_id` on the user → finds Customer records for that org → filters orders by those `customer_id`s.
- **Creating orders**: When creating an order, the system uses the user's organization to determine which Customer record to use. The user must have `organization_id` set.

---

## 5. Password & Email Flows

| Action | How |
|--------|-----|
| **Forgot password** | Login page → "Forgot password?" → Enter email or Login ID → Reset link sent. |
| **Change password** | Profile → Change Password → Enter current + new password. |
| **Confirmation email** | When password is changed (Profile or reset), a confirmation email is sent (for real emails only, not @login.local). |

---

## 6. Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "User has no organization" when creating order | User's `organization_id` is null | Admin: Edit user, assign Organization |
| Customer sees no orders | No Customer linked to their org, or Customer has no `organization_id` | Admin: Link Customer to org; ensure org matches user's org |
| Invalid login | Wrong Login ID or password | Use Login ID (e.g. `customer-org`) or full email (`customer-org@login.local`); reset password if needed |
| Customer can't create order | Customer record not linked to org | Admin: Customers → edit → set Organization |

---

## 7. Testing

For local testing with Acme Corporation:

```bash
npm run seed-org-customer
```

Then login with:

- **Login ID**: `customer-org`
- **Password**: `Test123!`

This user is linked to Acme Corporation org and can create orders, view orders, accept quotes, and track shipments.
