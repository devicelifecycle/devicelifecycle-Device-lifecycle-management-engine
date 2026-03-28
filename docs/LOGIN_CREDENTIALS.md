# DLM Engine — Login Credentials

**All use password: `Test123!`**

---

## Important: Use Organization Logins

There is no standalone user page — users always log in through their **organization**. For customer and vendor testing, **always use organization-linked logins** (e.g. `acme` for Acme Corporation). Do not use the generic `customer` or `vendor` logins; they are not tied to organizations and may not have full access.

---

## Organization Logins (recommended)

| Organization       | Login ID | Password  | Role     |
|--------------------|----------|-----------|----------|
| Acme Corporation   | `acme`   | Test123!  | customer |

**Setup:** Run `npm run seed-acme` to create the Acme org user.

---

## Internal Users (run `npm run seed-test-users`)

| Role        | Email / Login ID                     | Password  |
|-------------|--------------------------------------|-----------|
|GW3KQAVLNIWEK  |
| Sales       | `sales` (or sales@login.local)        | Test123!  |

---

## Generic Role Logins (avoid for normal use)

| Role     | Login ID  | Note |
|----------|-----------|------|
| Customer | `customer`| Not org-linked; use `acme` instead |
| Vendor   | `vendor`  | Not org-linked; add org-based vendor login if needed |

---

## All Six Accounts (multi-window / multi-profile)

**Password for all: `Test123!`**

| # | Login / Email                    | Role        | Use for                          |
|---|----------------------------------|-------------|----------------------------------|
| 1 | jamal.h@genovation.ai            | Admin       | Full admin, Pricing, Users       |
| 2 | faisalahmed4629@gmail.com        | CoE Manager | Receiving, Triage, Exceptions    |
| 3 | jamalhuss@gmail.com              | CoE Tech    | Receiving, Triage, Shipping      |
| 4 | `sales`                          | Sales       | Orders, Customers, Vendors       |
| 5 | `acme`                           | Customer    | My Orders, Exception approval    |
| 6 | `vendor`                         | Vendor      | Vendor orders (if seeded)        |

**Multi-login:** Use Chrome profiles or different browsers — one window per account, log in once each, keep all six open at once.

---

## Setup

1. `npm run dev`
2. `npm run seed-test-users` (internal users)
3. `npm run seed-acme` (Acme customer org login)
4. Login at http://localhost:3000/login with email (or Login ID for sales/acme/vendor) + Test123!

---

## Forgot Password

Use the **Login ID** (e.g. `acme`, `admin`) or the **email** associated with your account. A reset link will be emailed to the address on file.

**Email delivery requires:**
- `RESEND_API_KEY` set in `.env` (get one at [resend.com](https://resend.com))
- The account must have a real email address (not `*@login.local`)

## How Do Customers Log In & Use the App?

See **[CUSTOMER_ACCESS_FLOW.md](./CUSTOMER_ACCESS_FLOW.md)** for the full flow: how admins set up customer accounts, how customers log in, and how they create orders, view orders, accept quotes, and track shipments.
