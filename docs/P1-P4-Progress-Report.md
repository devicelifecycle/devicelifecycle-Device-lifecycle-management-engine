# Device Lifecycle Management Engine — P1–P4 Progress Report

**Project:** Device Lifecycle Management Engine (SCC Internal Platform)
**Stack:** Next.js 16, Supabase, TailwindCSS, shadcn/ui, React Query
**Date:** April 2026
**Status:** All four phases complete

---

## Overview

The platform provides end-to-end device lifecycle management — from customer trade-in and purchase orders through internal COE triage, pricing, sourcing, QC, and outbound shipping. Six role types are supported: Admin, COE Manager, COE Tech, Sales, Customer, and Vendor.

---

## Phase 1 — Core Platform

**Status: COMPLETE**

All pages, API routes, services, and authentication built and audited.

### Authentication & Access Control
- Email/password login with Supabase Auth
- PKCE-compliant forgot-password and password-reset flow
- MFA (TOTP) challenge on login + MFA management in user profile
- Role-based routing — each role lands on the correct dashboard automatically
- Middleware-enforced route protection for all dashboard pages

### User & Organisation Management (Admin)
- Full user list with search, pagination, role filter, and active/inactive toggle
- Create / edit users with role assignment and organisation linking
- Customer and vendor organisation management (create, edit, soft-delete)
- Phone number field on all user records

### Device Catalog (Admin / COE)
- 608-device catalog covering iPhones, iPads, MacBooks, Samsung Galaxy, Google Pixel, and accessories
- Add / edit / deactivate devices; specifications stored as structured JSON (storage, color, year, CPU, RAM)
- Server-side search + pagination across all catalog pages
- Duplicate catalog row cleanup and Samsung variant deduplication

### Orders (All Roles)
- Order creation for customers (Trade-In wizard, Purchase order, CSV/spreadsheet import)
- Order list with filters by status, type, date range, and search
- Order detail page with full timeline, notes, documents, and action buttons per role
- Auto-split orders by device type when a single quote covers multiple categories
- Vendor bid management — vendors submit bids, internal team accepts/rejects

### Notifications
- In-app notification bell with unread count, mark-as-read, and clear-all
- Real-time delivery via Supabase Realtime subscriptions
- Email notifications for key workflow events (quote issued, accepted, shipped, etc.)
- Notification gaps closed for CPO and vendor workflows

### Reports & Analytics
- Full analytics API covering order volume, revenue, device mix, SLA breach rates
- Reports page with charts: order trends, top devices, condition breakdown, revenue over time

### Settings & Profile
- User profile — name, phone, avatar, password change, MFA toggle
- Platform settings accessible by admin

### Infrastructure
- Next.js 16 with App Router and Turbopack
- Supabase RLS policies enforced on all tables
- Vercel deployment with timezone set to America/Toronto
- npm vulnerability remediation (minimatch, picomatch, flatted, eslint)
- Production 404 and cron error rate resolved
- Code-split heavy pages for fast FCP (admin pricing: 19 s → deferred load)

---

## Phase 2 — Email, Real-time, Bulk Operations, and Security

**Status: COMPLETE**

### Email Notifications
- Quote-issued email to customers with itemised device list
- Quote-accepted confirmation with shipping instructions
- Shipment-received acknowledgement to customers
- All emails rendered with Resend + React Email templates

### Real-time Updates
- Supabase Realtime subscription on orders table — order detail page updates live without refresh
- Notification bell updates live when a new notification arrives

### Bulk Operations
- Admin bulk status update for multiple orders
- Bulk device catalog import via CSV

### Security Hardening
- Service-role client used for cross-org data access (bypasses customer RLS safely)
- Auth cache hydration mismatch fixed on login
- Pricing routes protected by role check before any DB query
- SQL injection surface audited — all queries use parameterised Supabase client calls

### PDF Generation
- Order summary PDF export for customers and internal team

---

## Phase 3 — COE Workflow, Pricing Engine, and Scraping

**Status: COMPLETE**

### COE Triage Workflow
- Triage queue showing all inbound orders awaiting inspection
- Per-SKU receiving manifest — tech logs each device with condition and IMEI/serial
- Condition mismatch repricing panel — auto-adjusts quote when device condition differs from submission
- Mismatch quotes flagged for customer acknowledgement before proceeding
- Exception resolution: customer can approve or dispute; COE resolves internally
- Orders auto-advance through triage stages after exception approval
- SLA auto-escalation — persistently breached orders escalate to COE Manager automatically

### Pricing Engine
- Multi-model pricing calculator (`/api/pricing/calculate`)
  - Three strategies: competitor-market, data-driven (self-trained ML), and hybrid
  - Beat-competitor mode: price slightly above named competitor
  - Confidence scoring — shows amber warning when estimate uses internal data only
- Per-brand margin overrides — admin sets custom margin per brand (Apple, Samsung, etc.)
- Demand adjustment toggle — boosts prices when recent trade volume is high
- `prefer_data_driven` flag to switch between ML and rule-based pricing
- A/B model comparison endpoint for pricing accuracy evaluation

### Self-Trained ML Pricing Model
- Trains on historical order data stored in Supabase
- Auto-retrains when baseline data is sparse
- Predict endpoint returns price estimate with confidence band
- Data-driven model wired into the main pricing calculator as an alternative path

### Competitor Price Scraping
- Scrapers for Bell, GoRecell, Telus, Apple, and Universal (UniverCell/Fido)
- Cron pipeline runs daily — fetches, normalises, and stores competitor prices per device
- Staleness cron auto-deletes rows older than 2× the refresh threshold
- Failed scraper providers retried once before marking as failed
- Scraper health dashboard in admin pricing panel (last run time, row count, status)
- GoRecell scraper expanded to full catalog: phones, laptops, iPads, tablets
- Storage extraction from GoRecell rule titles (e.g. "128GB" parsed from description)
- Scrapling dual-mode pilot — Python-based scraper adapters wired behind env-var feature flags (`SCRAPER_*_IMPL=scrapling`)
- Phantom device cleanup to prevent prices appearing under wrong catalog entries

### Exception Management
- Rule-based AI suggestion for exception resolution — suggests accept/reject based on condition delta, device value, and customer history
- Exception suggestion endpoint returns reasoning alongside recommendation

---

## Phase 4 — Trade Template Parser and UX Polish

**Status: COMPLETE**

### Universal Trade Quote Parser

Customers and corporate accounts submit device trade quotes in wildly different spreadsheet formats. The parser handles all real-world layouts found in COE and SCC ITAD files (27 sheets across 2 workbooks analysed).

**8 layout patterns supported:**

| Pattern | Description | Example Customers |
|---|---|---|
| Simple batch | Model, Qty, Price — clean headers at row 0 | TOW, Van Air, 02-05 TBD |
| Multi-row merged headers | Group row ("30 Days") above sub-row ("Good" / "Fair") | Turow, ALSA |
| Combined make+model+storage+color | Single cell: "Apple iPhone 12 64GB Black" | McDougal, Tushar |
| Missing Make column | Brand inferred from model keywords (iPhone → Apple) | Belfor, Montreal, Neish Net |
| Pivot / transposed table | Models as column headers, price categories as row labels | PAL Aero, AMA RFQ |
| Storage-as-column-header | "32 GB" / "128 GB" are price columns, not data cells | Isl key (SCC ITAD) |
| Header not at row 0 | Row 0 is a date serial or title; real headers auto-detected | Lambton (row 10), Sheet1 (row 2), ATA |
| Per-device manifest | One row per physical device with IMEI and Serial | Pembina, Lambton, SCC ITAD |

**Parser capabilities:**
- Auto-detects header row by scoring rows 0–14 against known column keywords
- Merges multi-row group headers ("30 Days" + "Good" → "30 Good")
- Splits combined make+model+storage+color cells into structured fields
- Infers brand from model string when no Make column present
- Detects and transposes pivot tables — outputs one row per (model, condition) pair
- Resolves storage from column headers when storage is the column name not a cell value
- Groq LLM fallback when heuristic column mapping confidence is below 30%
- `?sheet=<name|index>` query param for multi-sheet workbooks
- Returns `available_sheets[]` in every response

**Condition normalisation (shared library `src/lib/condition.ts`):**
- Phrase lookup: 50+ aliases including grades A/B/C/D, "functional", "defective", "like new", "good working condition"
- Token fuzzy fallback: handles typos ("excellant", "excelent", "brokn")
- Prose fallback: classifies free-text notes ("minor scratch" → fair, "swollen battery" → fair, "cracked" → poor)
- "Recycle" rows preserved and filtered out before order creation

### Sheet Picker UI
- Import dialog detects multi-sheet workbooks automatically
- Compact sheet selector appears between file picker and preview table
- Switching sheet re-parses instantly and refreshes the preview
- Loader spinner shown during re-parse

### Device Picker UX Fixes
- Trade-in order form: dropdown shows full catalog (up to 50 devices) on open — no typing required
- COE triage Add Device dialog: loads first 20 devices alphabetically on open
- Both pickers filter as-you-type for targeted search

### Customer Quote Actions
- Customers see Accept and Decline buttons directly on quoted orders in their order list
- Quoted order rows highlighted in purple for quick identification
- Accepting transitions order to `accepted`; declining transitions to `rejected`
- Buttons disabled with loading state while transition is in flight

### Shipping Simplification
- Stallion Express in-app label purchase removed — shipping handled manually
- COE shipping page: clean form with Carrier + Tracking Number only
- Order detail shipment dialog: no Stallion toggle, no weight/dimensions inputs
- `/api/shipments/[id]/purchase-label` stubbed to 501 with clear message
- Tracking number always required for all roles

---

## Test Coverage

| Suite | Tests | Status |
|---|---|---|
| Unit — API routes (auth, orders, pricing, shipments, customers) | 800+ | All passing |
| Unit — Pricing model (all device categories, all strategies) | 300+ | All passing |
| Unit — Condition normaliser | 40+ | All passing |
| Unit — Scraper pipeline matching | 15 | All passing |
| Unit — Auth routing | 8 | All passing |
| Unit — Lib utilities | 20+ | All passing |
| Integration — Data-driven pricing model | 21 | Skipped (requires live DB) |
| **Total** | **1,339 passing / 21 skipped** | **0 failures** |

TypeScript strict check: **0 errors**

---

## Deployment

- Platform live on Vercel
- All commits on `main` branch auto-deploy
- Cron jobs configured in `vercel.json` for scraper pipeline and SLA escalation
- Environment variables managed in Vercel dashboard (Supabase, Resend, Groq, scraper flags)

---

*Report generated April 2026. All features shipped and live.*
