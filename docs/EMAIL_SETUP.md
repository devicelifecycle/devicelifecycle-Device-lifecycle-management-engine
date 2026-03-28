# Email Notifications Setup

This guide explains how to enable and configure email notifications across the DLM Engine.

## Easiest Path: Gmail SMTP (No Domain Verification)

**Use this to send to anyone** — no Resend signup, no domain verification, no DNS records.

1. **Enable 2-Step Verification** on your Gmail at [myaccount.google.com/security](https://myaccount.google.com/security)
2. **Create an App Password**: Google Account → Security → 2-Step Verification → App passwords → Select "Mail" → Generate
3. Add to `.env.local`:
   ```
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=your-16-char-app-password
   ```
4. Run the email test:
   ```bash
   npm run send-test-email faisalahmed4629@gmail.com
   ```

That's it. Emails will reach any address. Gmail limits: ~500 emails/day for free accounts.

---

## Alternative: Resend

### 1. Resend API Key

1. Sign up at [resend.com](https://resend.com) (free tier: 100 emails/day)
2. Add to `.env.local`:
   ```
   RESEND_API_KEY=re_your_api_key_here
   ```

### 2. App URL (for clickable links in emails)

Email links (View Order, Reset Password, etc.) use `NEXT_PUBLIC_APP_URL`. For production:

```
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
NEXT_PUBLIC_APP_NAME="Device Lifecycle Management"
```

### 3. Sending to External Emails (Domain Verification)

**Problem:** Resend's sandbox only allows sending to your own email (the account owner, e.g. `devicelifecycle@gmail.com`). To send to other addresses (e.g. `faisalahmed4629@gmail.com`, `jamal.h@genovation.ai`), you must verify a domain.

#### Step-by-step: Verify a domain at Resend

1. **Go to [resend.com/domains](https://resend.com/domains)** and log in.
2. **Click "Add Domain"** and enter your domain (e.g. `genovation.ai`).
   - Tip: Use a subdomain like `mail.genovation.ai` or `updates.genovation.ai` to isolate sending reputation.
3. **Copy the DNS records** Resend shows (SPF and DKIM TXT records).
4. **Add the records at your DNS provider** (GoDaddy, Cloudflare, Namecheap, etc.):
   - Go to your domain’s DNS settings.
   - Add each TXT record exactly as Resend shows (name and value).
   - Save the changes.
5. **Back in Resend**, click **"Verify DNS Records"**.
6. Wait a few minutes (propagation can take up to 48 hours, often faster).
7. Once status is **Verified**, you can send from addresses on that domain.

#### Step-by-step: Update the app to use the verified domain

1. Add to `.env.local`:
   ```
   RESEND_FROM_EMAIL=DLM Engine <noreply@yourdomain.com>
   ```
   Replace `yourdomain.com` with your **verified** domain (e.g. `noreply@genovation.ai` or `noreply@mail.genovation.ai`).

2. Restart the dev server: `npm run dev`.

3. Run the email test:
   ```bash
   npm run send-test-email faisalahmed4629@gmail.com
   npm run send-test-email jamal.h@genovation.ai
   npm run send-test-email jamalhuss@gmail.com
   ```

#### If you don’t own a domain

- You cannot send to arbitrary external emails from Resend’s sandbox.
- Options:
  1. Verify a domain you control (work or personal).
  2. Use a domain from a provider (e.g. free subdomain, or buy one).
  3. For local testing only, send to the Resend account owner email:
     ```bash
     npm run send-test-email devicelifecycle@gmail.com
     ```

### 4. Optional: Custom From Address (summary)

```
RESEND_FROM_EMAIL=DLM Engine <noreply@yourdomain.com>
```

(Default: `DLM Engine <onboarding@resend.dev>` — sandbox only, sends to your Resend account email)

---

## Entity Emails

| Entity | Field | Where to set |
|--------|-------|---------------|
| **Customers** | `contact_email` | Customer create/edit forms (required) |
| **Vendors** | `contact_email` | Vendor create/edit forms (required) |
| **Users (email login)** | `email` | Auth — used for notifications |
| **Users (Login ID)** | `notification_email` | Profile → Account Details, or Admin → Users → Edit |

---

## Login ID Users (@login.local)

Users who sign in with a Login ID (e.g. `acme-corp`) instead of a real email have auth email `acme-corp@login.local`. To receive order emails, forgot-password, etc., they must set a **Notification Email**:

- **Profile** → Account Details → Edit → Notification Email
- **Admin** → Users → Edit (for Login ID users)

If not set, no emails are sent to that user.

---

## What Triggers Emails

| Event | Recipients |
|-------|------------|
| Order created | Customer contact_email, org users |
| Quote ready | Customer |
| Order accepted | Admins, assigned user, all vendors (CPO broadcast) |
| Order status changes | Customer, vendor, assigned user, admins (by config) |
| Welcome (new user) | User's email or notification_email |
| Forgot password | User's email or notification_email |
| Password changed | Confirmation to user |

---

## Pages Linked to Email

| Page | Email-related behavior |
|------|------------------------|
| **Profile** | Login ID users can set notification_email for order updates, forgot-password |
| **Admin → Users** | Create: notification_email for Login ID. Edit: update notification_email |
| **Customers (new/edit)** | contact_email required — used for order notifications |
| **Vendors (new/edit)** | contact_email required — used for vendor order notifications |
