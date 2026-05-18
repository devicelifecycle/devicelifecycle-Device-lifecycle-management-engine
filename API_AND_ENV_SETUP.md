# API & ENVIRONMENT SETUP
## Device Lifecycle Management Engine

---

## .env.example (Full Variable Reference)

```env
# ============================================================
# SUPABASE — Required
# ============================================================
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret-key>

# ============================================================
# SITE URL — Required for email links, OAuth redirects
# ============================================================
NEXT_PUBLIC_SITE_URL=https://your-domain.com
# Vercel auto-injects VERCEL_URL in production if SITE_URL not set

# ============================================================
# EMAIL — At least one required for welcome emails + quote emails
# ============================================================

# Option A: Gmail SMTP (simple, dev-friendly)
GMAIL_USER=yourapp@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Option B: Resend (recommended for production)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Option C: SMTP generic
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SMTP_FROM=noreply@example.com

# ============================================================
# SMS — Optional, Twilio
# ============================================================
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1xxxxxxxxxx

# ============================================================
# PRICE SCRAPERS — Feature flags (set true to enable)
# ============================================================
SCRAPER_BELL_ENABLED=true
SCRAPER_TELUS_ENABLED=true
SCRAPER_GORECELL_ENABLED=true
SCRAPER_UNIVERCELL_ENABLED=false
SCRAPER_APPLE_ENABLED=true

# Scrapling (Python anti-bot) mode per provider:
#   ts       = TypeScript native adapter only
#   scrapling = Python worker only
#   dual     = Run both, use scrapling result preferentially
BELL_SCRAPER_MODE=ts
TELUS_SCRAPER_MODE=ts
UNIVERCELL_SCRAPER_MODE=scrapling
GORECELL_SCRAPER_MODE=ts
APPLE_SCRAPER_MODE=ts

# Python worker config
SCRAPLING_PYTHON_BIN=python3              # or ./scrapers_py/.venv-scrapling/bin/python
SCRAPLING_WORKER_TIMEOUT_MS=30000        # 30s timeout per worker

# ============================================================
# EXTERNAL SERVICES — Optional
# ============================================================

# IMEI Check (device verification)
IMEI_CHECK_API_KEY=your-key

# TestPod (battery health)
TESTPOD_API_KEY=your-key
TESTPOD_API_URL=https://api.testpod.io

# Shippo (multi-carrier shipping labels)
SHIPPO_API_KEY=shippo_test_...

# Stallion Express (Canadian carrier)
STALLION_API_KEY=your-key
STALLION_API_URL=https://api.stallionexpress.ca

# ============================================================
# AI INTEGRATION
# ============================================================
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# ============================================================
# PRICING CONFIGURATION
# ============================================================
PRICING_TRAINING_ENABLED=true
COMPETITOR_SYNC_ENABLED=true
BEAT_COMPETITOR_DEFAULT_PCT=0          # % to beat competitor by (0 = match)
PRICING_STALENESS_DAYS=7              # Flag prices older than 7 days

# ============================================================
# SECURITY
# ============================================================
SESSION_DURATION=604800               # 7 days in seconds
CRON_SECRET=your-secret-for-cron-endpoints

# ============================================================
# FEATURE FLAGS
# ============================================================
NEXT_PUBLIC_ENABLE_CHAT=true
NEXT_PUBLIC_ENABLE_SCRAPERS=true
NEXT_PUBLIC_SHOW_COMPETITOR_PRICES=true   # internal only toggle
```

---

## Supabase Setup Checklist

### 1. Create Project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. New Project → choose region (Canada Central or US East for low latency)
3. Save the password — you'll need it for migrations

### 2. Get Credentials
From Project Settings → API:
- `URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (never expose to client)

### 3. Run Migrations
```bash
supabase link --project-ref <ref>
supabase db push
```

### 4. Enable Realtime
Go to Database → Replication → enable realtime for:
- orders
- order_items
- notifications
- order_exceptions
- shipments

(Migration `20260409000000_enable_realtime_all_tables.sql` handles this automatically)

### 5. Configure Auth
From Authentication → Settings:
- Site URL: `https://your-domain.com`
- Redirect URLs: `https://your-domain.com/auth/callback`
- Enable email confirmation: YES (for customer/vendor provisioning)
- JWT expiry: 604800 (7 days, matching SESSION_DURATION)

### 6. Storage Buckets
Created by migration `20240115000000_create_storage_buckets.sql`:
- `order-attachments`
- `device-images`
- `triage-photos`

---

## API Route Reference

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/forgot-password` | None | Send reset link |

### Orders (Core)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/orders` | Required | List orders (role-scoped) |
| POST | `/api/orders` | Required | Create order |
| GET | `/api/orders/[id]` | Required | Get order detail |
| PATCH | `/api/orders/[id]` | Required | Update order fields |
| DELETE | `/api/orders/[id]` | admin, coe_manager | Delete order |
| POST | `/api/orders/[id]/transition` | Required | Advance order status |
| PATCH | `/api/orders/[id]/items` | Required | Update item prices (bulk) |
| PATCH | `/api/orders/[id]/items/[itemId]` | Required | Update single item |
| DELETE | `/api/orders/[id]/items/[itemId]` | admin, coe_manager | Remove item |
| POST | `/api/orders/[id]/send-quote-email` | Internal roles | Send quote to customer |
| GET | `/api/orders/[id]/pdf` | Required | Generate PDF quote |
| GET | `/api/orders/[id]/excel` | Required | Generate Excel quote |
| POST | `/api/orders/[id]/generate-quote` | Internal | Auto-generate pricing |
| POST | `/api/orders/[id]/split` | admin, coe_manager | Split into sub-orders |
| POST | `/api/orders/bulk-transition` | Required | Bulk status change |
| DELETE | `/api/orders/bulk-delete` | admin, coe_manager | Bulk delete |
| POST | `/api/orders/upload-csv` | Required | CSV order import |

### Order Exceptions / Discrepancies

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/orders/[id]/discrepancies` | Required | List discrepancies |
| POST | `/api/orders/[id]/discrepancies/[exId]/approve-admin` | admin | Admin approve |
| POST | `/api/orders/[id]/discrepancies/[exId]/approve-coe` | coe | COE approve |
| POST | `/api/orders/[id]/discrepancies/[exId]/reject` | Required | Reject exception |
| GET | `/api/orders/[id]/exceptions` | Required | Customer exceptions |
| POST | `/api/orders/[id]/add-mismatch` | Required | Add mismatch |
| GET | `/api/orders/[id]/audit-mismatch` | Required | Audit log |
| POST | `/api/orders/[id]/mismatch-notice` | Required | Send notice |

### Pricing

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/pricing` | Internal | Pricing records list |
| GET | `/api/pricing/competitors` | Internal | Competitor prices |
| POST | `/api/pricing/calculate` | Internal | Calculate single device price |
| POST | `/api/pricing/calculate-batch` | Internal | Batch price calculation |
| POST | `/api/pricing/calculate-buyback` | Internal | CPO buyback guarantee |
| GET | `/api/pricing/market` | Internal | Market context |
| GET | `/api/pricing/settings` | admin | Pricing configuration |
| PATCH | `/api/pricing/settings` | admin | Update pricing settings |
| POST | `/api/pricing/train` | admin | Trigger model training |
| GET | `/api/pricing/accuracy` | admin | Model accuracy report |
| GET | `/api/pricing/catalog` | Internal | Priced device catalog |
| GET | `/api/pricing/brand-overrides` | admin | Per-brand margins |
| POST | `/api/pricing/scrape` | admin | Manual scrape trigger |

### Devices

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/devices` | Required | Device catalog (role-filtered) |
| POST | `/api/devices` | admin, coe_manager | Create device |
| GET | `/api/devices/[id]` | Required | Get device |
| PATCH | `/api/devices/[id]` | admin, coe_manager | Update device |
| DELETE | `/api/devices/[id]` | admin | Delete device |

### Customers / Vendors / Organizations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/customers` | Internal | Customer list |
| POST | `/api/customers` | admin | Create customer |
| GET | `/api/customers/me` | customer | My customer record |
| GET | `/api/customers/[id]/orders` | Internal | Customer's orders |
| GET | `/api/vendors` | Internal | Vendor list |
| GET | `/api/vendors/open-orders` | vendor | CPO orders open for bids |
| GET/POST | `/api/vendors/bids` | vendor | Bid management |
| GET | `/api/organizations` | Required | Org list (role-scoped) |
| POST | `/api/organizations` | admin | Create org (+ provision user) |

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | Required | User's notifications |
| POST | `/api/notifications/[id]/read` | Required | Mark read |
| POST | `/api/notifications/read-all` | Required | Mark all read |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | admin | All users |
| POST | `/api/users` | admin | Create user |
| GET/PATCH/DELETE | `/api/users/[id]` | admin | User management |

### Triage (COE)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/triage` | coe | Triage queue |
| POST | `/api/triage` | coe | Submit triage |
| POST | `/api/triage/[id]/exception` | coe | Flag exception |

### Shipments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/shipments` | Required | Shipments list |
| POST | `/api/shipments` | Required | Create shipment |
| PATCH | `/api/shipments/[id]` | Required | Update tracking |
| POST | `/api/shipments/[id]/purchase-label` | Internal | Buy shipping label |
| GET | `/api/shipments/stats` | Internal | Shipment stats |

### Cron Jobs (Vercel Cron, protected by CRON_SECRET header)

| Path | Schedule | Description |
|---|---|---|
| `/api/cron/sla-check` | Every 30min | Check SLA breaches |
| `/api/cron/price-scraper` | Daily | Scrape all competitors |
| `/api/cron/competitor-sync` | Daily | Sync competitor prices |
| `/api/cron/pricing-staleness` | Daily | Flag stale prices |
| `/api/cron/pricing-training` | Weekly | Retrain pricing model |
| `/api/cron/bid-expiry` | Hourly | Expire old vendor bids |
| `/api/cron/quote-price-check` | Daily | Flag changed quote prices |
| `/api/cron/shipping-tracking` | Every 2h | Update shipment statuses |

---

## Role-Based API Access Matrix

| Endpoint Group | admin | coe_manager | coe_tech | sales | customer | vendor |
|---|---|---|---|---|---|---|
| Orders (read own) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Orders (read all) | ✓ | ✓ | ✓ | ✓ | — | — |
| Orders (create) | ✓ | ✓ | — | ✓ | ✓ | — |
| Orders (delete) | ✓ | ✓ | — | — | — | — |
| Pricing (read) | ✓ | ✓ | ✓ | ✓ | — | — |
| Pricing (write) | ✓ | ✓ | — | — | — | — |
| Pricing (admin) | ✓ | — | — | — | — | — |
| Devices (read) | ✓ | ✓ | ✓ | ✓ | ✓* | ✓* |
| Devices (write) | ✓ | ✓ | — | — | — | — |
| Users (admin) | ✓ | — | — | — | — | — |
| Organizations | ✓ | — | — | — | own | own |
| Customers (list) | ✓ | ✓ | — | ✓ | — | — |
| Vendors (list) | ✓ | ✓ | — | ✓ | — | — |
| Triage | ✓ | ✓ | ✓ | — | — | — |
| Shipments | ✓ | ✓ | ✓ | ✓ | — | ✓** |
| Vendor bids | ✓ | ✓ | — | — | — | ✓ |
| Open CPO orders | ✓ | ✓ | — | — | — | ✓ |

`*` = filtered data only (no competitor pricing)
`**` = inbound tracking only (ship-to-COE)

---

## Email Delivery Priority

The system tries email providers in this order:

1. **Resend** (if `RESEND_API_KEY` set)
2. **Gmail SMTP** (if `GMAIL_USER` + `GMAIL_APP_PASSWORD` set)
3. **Generic SMTP** (if `SMTP_HOST` set)
4. **Log-only** fallback (no error thrown, email logged to console)

---

## Vercel Deployment Config

```json
// vercel.json
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

Set `CRON_SECRET` in Vercel env vars and pass it as `Authorization: Bearer <CRON_SECRET>` in cron route handlers to prevent unauthorized execution.
