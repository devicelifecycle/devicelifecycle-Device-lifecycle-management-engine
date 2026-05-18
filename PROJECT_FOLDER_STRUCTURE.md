# PROJECT FOLDER STRUCTURE
## Device Lifecycle Management Engine

---

## Root Directory

```
Device-lifecycle-management-engine/
├── src/                          # All application source code
├── supabase/                     # Database migrations + Supabase config
├── scrapers_py/                  # Python anti-bot scraping workers
├── scripts/                      # Operational CLI scripts
├── tests/                        # Test suites
├── public/                       # Static assets
├── .env.example                  # Environment variable template
├── .env.local                    # Local secrets (gitignored)
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── package.json                  # Dependencies + npm scripts
├── eslint.config.mjs             # ESLint rules
└── vitest.config.ts              # Vitest test configuration
```

---

## src/ — Application Source

```
src/
├── app/                          # Next.js 14 App Router
│   ├── (auth)/                   # Auth route group (no layout)
│   │   ├── login/page.tsx        # Login page
│   │   ├── register/page.tsx     # Registration
│   │   ├── forgot-password/      # Password reset request
│   │   ├── reset-password/       # Password reset form
│   │   └── auth/callback/        # Supabase OAuth callback
│   │
│   ├── (dashboard)/              # Main app route group (with layout)
│   │   ├── layout.tsx            # Dashboard shell (Header + Sidebar)
│   │   ├── page.tsx              # Root redirect → /dashboard
│   │   ├── dashboard/page.tsx    # Main dashboard KPIs
│   │   │
│   │   ├── admin/                # Admin-only portal
│   │   │   ├── users/page.tsx    # User management
│   │   │   ├── organizations/    # Organization management
│   │   │   ├── pricing/          # Pricing control panel
│   │   │   ├── sla-rules/        # SLA configuration
│   │   │   └── audit-log/        # System audit trail
│   │   │
│   │   ├── coe/                  # COE workflow
│   │   │   ├── receiving/        # Device intake
│   │   │   ├── triage/           # Device inspection + grading
│   │   │   ├── exceptions/       # Discrepancy handling
│   │   │   └── shipping/         # Outbound shipping
│   │   │
│   │   ├── customer/             # Customer portal
│   │   │   ├── orders/           # Customer order list
│   │   │   │   └── [id]/         # Customer order detail
│   │   │   └── requests/         # Service requests
│   │   │
│   │   ├── vendor/               # Vendor portal
│   │   │   ├── orders/           # Orders assigned to vendor
│   │   │   └── bids/             # Open bid opportunities
│   │   │
│   │   ├── orders/               # Internal order management
│   │   │   ├── page.tsx          # Orders list with filters
│   │   │   ├── new/              # Order creation
│   │   │   │   ├── page.tsx      # Unified (Trade-In + CPO)
│   │   │   │   ├── trade-in/     # Trade-In specific form
│   │   │   │   └── cpo/          # CPO specific form
│   │   │   └── [id]/             # Order detail
│   │   │       ├── page.tsx      # Server wrapper
│   │   │       └── _client.tsx   # Full client (3000+ lines)
│   │   │
│   │   ├── customers/            # Customer management
│   │   │   ├── page.tsx          # Customer list
│   │   │   ├── new/page.tsx      # Create customer
│   │   │   └── [id]/page.tsx     # Customer detail + orders
│   │   │
│   │   ├── vendors/              # Vendor management
│   │   │   ├── page.tsx          # Vendor list
│   │   │   ├── new/page.tsx      # Create vendor
│   │   │   └── [id]/page.tsx     # Vendor detail + performance
│   │   │
│   │   ├── devices/page.tsx      # Device catalog
│   │   ├── reports/page.tsx      # Analytics + reports
│   │   ├── notifications/page.tsx# Notification center
│   │   ├── profile/page.tsx      # User profile
│   │   ├── bids/page.tsx         # Bid management
│   │   └── exceptions/page.tsx   # Exception management
│   │
│   ├── api/                      # REST API routes (114 endpoints)
│   │   ├── auth/forgot-password/
│   │   ├── admin/
│   │   │   ├── audit-log/
│   │   │   └── sla-rules/[id]/
│   │   ├── chat/                 # AI assistant endpoint
│   │   ├── cron/                 # Scheduled job triggers
│   │   │   ├── bid-expiry/
│   │   │   ├── competitor-sync/
│   │   │   ├── price-scraper/
│   │   │   │   └── providers/{apple,bell,gorecell,telus,universal}/
│   │   │   ├── pricing-staleness/
│   │   │   ├── pricing-training/
│   │   │   ├── quote-price-check/
│   │   │   ├── shipping-tracking/
│   │   │   └── sla-check/
│   │   ├── customer/dashboard/
│   │   ├── customers/
│   │   │   ├── route.ts          # GET list, POST create
│   │   │   ├── [id]/route.ts     # GET, PATCH, DELETE
│   │   │   ├── [id]/orders/
│   │   │   ├── me/               # Current user's customer
│   │   │   └── export/
│   │   ├── dashboard/counts/
│   │   ├── devices/
│   │   │   ├── route.ts          # GET catalog, POST create
│   │   │   └── [id]/route.ts     # GET, PATCH, DELETE
│   │   ├── exceptions/
│   │   ├── health/scrapers/
│   │   ├── imei/[imei]/
│   │   ├── notifications/
│   │   │   ├── route.ts
│   │   │   ├── [id]/read/
│   │   │   └── read-all/
│   │   ├── orders/
│   │   │   ├── route.ts          # GET list, POST create
│   │   │   ├── [id]/
│   │   │   │   ├── route.ts      # GET, PATCH, DELETE
│   │   │   │   ├── add-mismatch/
│   │   │   │   ├── audit-mismatch/
│   │   │   │   ├── discrepancies/
│   │   │   │   │   └── [exceptionId]/{approve-admin,approve-coe,reject}/
│   │   │   │   ├── excel/        # Excel export
│   │   │   │   ├── exceptions/
│   │   │   │   ├── generate-quote/
│   │   │   │   ├── items/        # PATCH item prices
│   │   │   │   │   ├── [itemId]/ # PATCH/DELETE single item
│   │   │   │   │   ├── buyback/
│   │   │   │   │   ├── reprice-mismatches/
│   │   │   │   │   └── route/
│   │   │   │   ├── mismatch-notice/
│   │   │   │   ├── notify-price-change/
│   │   │   │   ├── pdf/          # PDF quote generation
│   │   │   │   ├── send-quote-email/
│   │   │   │   ├── split/
│   │   │   │   └── transition/   # Status machine
│   │   │   ├── bulk-delete/
│   │   │   ├── bulk-transition/
│   │   │   ├── parse-trade-template/
│   │   │   └── upload-csv/
│   │   ├── organizations/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── pricing/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   ├── accuracy/
│   │   │   ├── brand-overrides/
│   │   │   ├── calculate/
│   │   │   ├── calculate-batch/
│   │   │   ├── calculate-buyback/
│   │   │   ├── catalog/
│   │   │   ├── competitors/
│   │   │   │   ├── route.ts
│   │   │   │   ├── cleanup-phantom-devices/
│   │   │   │   ├── cleanup-unknown/
│   │   │   │   ├── export/
│   │   │   │   └── import/
│   │   │   ├── international/
│   │   │   ├── manual-prices/
│   │   │   ├── market/[id]/
│   │   │   ├── model/
│   │   │   ├── notify-quote-updates/
│   │   │   ├── scrape/changes/
│   │   │   ├── settings/
│   │   │   ├── train/
│   │   │   ├── training/
│   │   │   └── upload/
│   │   ├── reports/reconciliation/
│   │   ├── shipments/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   ├── [id]/purchase-label/
│   │   │   └── stats/
│   │   ├── testpod/lookup/
│   │   ├── triage/
│   │   │   ├── route.ts
│   │   │   ├── [id]/exception/
│   │   │   └── upload-template/
│   │   ├── twilio/{health,test}/
│   │   ├── users/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   └── password-change-confirmation/
│   │   └── vendors/
│   │       ├── route.ts
│   │       ├── [id]/route.ts
│   │       ├── [id]/orders/
│   │       ├── [id]/performance/
│   │       ├── bids/route.ts
│   │       ├── bids/[id]/route.ts
│   │       ├── export/
│   │       └── open-orders/
│   │
│   ├── globals.css               # Global styles
│   └── layout.tsx                # Root layout (providers, fonts)
│
├── components/                   # Shared React components
│   ├── layout/
│   │   ├── Header.tsx            # Top bar (breadcrumbs, notifications, user menu)
│   │   └── Sidebar.tsx           # Role-based navigation
│   ├── orders/
│   │   └── DiscrepancyDetail.tsx # Exception display component
│   ├── shared/
│   │   ├── StatusBadge.tsx       # Order/shipment status badge
│   │   └── TradeInWizard.tsx     # Multi-step trade-in creation
│   ├── chat/
│   │   ├── ChatAssistant.tsx     # AI chat panel
│   │   └── ChatMessage.tsx       # Message bubble
│   ├── landing/
│   │   ├── OrbitingDeviceField.tsx
│   │   ├── PremiumDeviceShowcase.tsx
│   │   ├── ScrollParallaxBubbles.tsx
│   │   └── UnboxingAnimation.tsx
│   └── ui/                       # Shadcn/Radix primitives
│       ├── alert-dialog.tsx
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── pagination.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── skeleton.tsx
│       ├── switch.tsx
│       ├── table.tsx
│       ├── tabs.tsx
│       ├── textarea.tsx
│       ├── toast.tsx
│       ├── toaster.tsx
│       └── tooltip.tsx
│
├── hooks/                        # Custom React hooks (15 total)
│   ├── useAuth.ts                # Auth state + login/logout + role switch
│   ├── useBids.ts                # Vendor bid queries
│   ├── useCustomerDashboard.ts   # Customer portal KPIs
│   ├── useCustomers.ts           # Customer CRUD
│   ├── useDashboardCounts.ts     # Dashboard KPI counts
│   ├── useDebounce.ts            # Debounce helper
│   ├── useDevices.ts             # Device catalog queries
│   ├── useNotifications.ts       # Notifications + realtime
│   ├── useOnDbChange.ts          # Supabase realtime helper
│   ├── useOrders.ts              # Order CRUD + realtime + bulk ops
│   ├── useOrganizations.ts       # Organization queries
│   ├── useRealtimeSync.ts        # Global realtime invalidation
│   ├── useShipments.ts           # Shipment tracking
│   └── useVendors.ts             # Vendor queries
│
├── services/                     # Server-side business logic (21 services)
│   ├── audit.service.ts
│   ├── auth.service.ts
│   ├── customer.service.ts
│   ├── device.service.ts
│   ├── email.service.ts
│   ├── exception.service.ts
│   ├── imei.service.ts
│   ├── notification.service.ts
│   ├── order-split.service.ts
│   ├── order.service.ts
│   ├── organization.service.ts
│   ├── pricing-health.service.ts
│   ├── pricing-training.service.ts
│   ├── pricing.service.ts
│   ├── shipment.service.ts
│   ├── shipping-provider.service.ts
│   ├── sla.service.ts
│   ├── triage.service.ts
│   ├── user-provisioning.service.ts
│   └── vendor.service.ts
│
├── lib/                          # Utilities and integrations
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # SSR Supabase client (cookie-based)
│   │   ├── service-role.ts       # Admin client (service role key)
│   │   ├── middleware.ts         # Middleware Supabase client
│   │   └── require-auth.ts       # Fast API auth guard
│   ├── scrapers/
│   │   ├── index.ts              # Public scraper API exports
│   │   ├── pipeline.ts           # Scraper orchestration
│   │   ├── types.ts              # Scraper types
│   │   ├── adapters/
│   │   │   ├── apple.ts          # Apple Trade-In
│   │   │   ├── bell.ts           # Bell Trade-In (TS)
│   │   │   ├── bell-scrapling.ts # Bell (Python worker)
│   │   │   ├── gorecell.ts       # GoRecell
│   │   │   ├── telus.ts          # Telus (TS)
│   │   │   ├── telus-scrapling.ts# Telus (Python worker)
│   │   │   ├── universal.ts      # Universal adapter
│   │   │   ├── universal-scrapling.ts
│   │   │   └── scrapling-worker-utils.ts # Python worker bridge
│   │   ├── condition-pricing.ts  # Condition multipliers
│   │   ├── health-audit.ts       # Scraper health checks
│   │   ├── post-scrape.ts        # Data normalization
│   │   ├── rollout-metadata.ts   # Rollout state tracking
│   │   ├── utils.ts              # Helpers
│   │   └── validation-fixtures.ts
│   ├── chat/
│   │   ├── prompts.ts            # AI system prompts
│   │   └── tools.ts              # AI function tools
│   ├── twilio/
│   │   └── server.ts             # SMS integration
│   ├── auth-routing.ts           # Role → default path mapping
│   ├── condition.ts              # Device condition normalization
│   ├── constants.ts              # Global constants (810 lines)
│   ├── csv-templates.ts          # CSV import/export
│   ├── customer-profile.ts       # Customer data helpers
│   ├── device-match.ts           # Fuzzy device matching
│   ├── order-visibility.ts       # sanitizeOrderForVendor()
│   ├── pdf.ts                    # PDF generation (jsPDF)
│   ├── pricing-device-resolution.ts
│   ├── rate-limit.ts             # Rate limiting utility
│   ├── server-env.ts             # Server env access
│   ├── utils.ts                  # General helpers + getSiteUrl()
│   └── validations.ts            # Zod schemas
│
├── types/
│   └── index.ts                  # All TypeScript types (978 lines)
│
└── proxy.ts                      # Next.js middleware (role routing + cookie caching)
```

---

## supabase/ — Database

```
supabase/
├── config.toml                   # Supabase project config
└── migrations/                   # 52 SQL migration files
    ├── 20240101000000_initial_schema.sql
    ├── 20240115000000_create_storage_buckets.sql
    ├── 20240115000001_add_missing_rls_policies.sql
    ├── 20240115000002_seed_test_data.sql
    ├── 20240115000003_add_composite_indexes.sql
    ├── 20240115000004_fix_order_number_concurrency.sql
    ├── 20240115000005_audit_log_rls_policies.sql
    ├── 20260204_pricing_tables.sql
    ├── 20260220_pricing_v2.sql
    ├── 20260221_pricing_settings.sql
    ├── 20260222_customers_default_risk_mode.sql
    ├── 20260223_order_items_pricing_metadata.sql
    ├── 20260225000000_expand_device_catalog.sql
    ├── 20260226000000_trained_pricing_baselines.sql
    ├── 20260227090000_shippo_shipping_integration.sql
    ├── 20260227100000_security_sla_breaches_rls.sql
    ├── 20260303100000_order_items_extended_fields.sql
    ├── 20260303200000_order_splitting.sql
    ├── 20260304000000_apple_iphone_full_catalog.sql
    ├── 20260306190000_add_competitor_condition.sql
    ├── 20260306191500_add_margin_mode_settings.sql
    ├── 20260306193000_ensure_pricing_settings_exists.sql
    ├── 20260306195000_add_competitor_ceiling_setting.sql
    ├── 20260306195500_add_excellent_competitor_condition.sql
    ├── 20260306201000_seed_expanded_device_catalog.sql
    ├── 20260306213000_add_competitor_prices_unique_key.sql
    ├── 20260308000000_order_items_buyback_guarantee.sql
    ├── 20260308120000_add_notification_email.sql
    ├── 20260308130000_organization_delete_cascade.sql
    ├── 20260308140000_ensure_order_items_storage_colour.sql
    ├── 20260312000000_international_pricing.sql
    ├── 20260312100000_orders_depreciation_rate_override.sql
    ├── 20260313000000_beat_competitor_default.sql
    ├── 20260318000000_customer_mobile_carrier.sql
    ├── 20260322000000_quote_expires_at.sql
    ├── 20260326090000_ensure_trained_pricing_tables.sql
    ├── 20260328000000_seed_complete_device_catalog.sql
    ├── 20260402000000_fix_missing_columns.sql
    ├── 20260407000000_add_order_direction_and_separate_sequences.sql
    ├── 20260407000001_add_exception_tracking.sql
    ├── 20260407000002_add_order_exceptions_to_realtime.sql
    ├── 20260409000000_enable_realtime_all_tables.sql
    ├── 20260413000000_comprehensive_device_catalog.sql
    ├── 20260414000000_add_competitor_prices_stale_cleanup_index.sql
    ├── 20260414100000_missing_2025_2026_devices.sql
    ├── 20260414200000_dedup_samsung_sku.sql
    ├── 20260415000000_rls_gaps.sql
    ├── 20260415020000_brand_pricing.sql
    ├── 20260420000000_seed_competitor_prices.sql
    ├── 20260420200000_seed_missing_competitor_prices.sql
    ├── 20260421000000_fix_competitor_prices_accuracy.sql
    ├── 20260421200000_restore_comprehensive_competitor_prices.sql
    ├── 20260504000000_ensure_samsung_google_motorola.sql
    ├── 20260504200000_seed_competitor_sell_prices.sql
    ├── 20260512000000_add_secondary_role.sql
    └── 20260512100000_add_device_last_manual_prices.sql
```

---

## scrapers_py/ — Python Anti-Bot Workers

```
scrapers_py/
├── README.md                     # Worker contract + setup
├── requirements.txt              # Python deps (camoufox, playwright, patchright)
├── apple_worker.py               # Apple Trade-In prices (HTML parsing)
├── bell_worker.py                # Bell Trade-In (session auth + API)
├── gorecell_worker.py            # GoRecell (catalog crawling)
├── telus_worker.py               # Telus (trade-in API)
└── univercell_worker.py          # UniverCell (server actions + TLS fingerprint)
```

---

## scripts/ — Operational CLI Tools

```
scripts/
├── User Management
│   ├── create-admin-user.mjs
│   ├── seed-test-users.mjs
│   ├── seed-org-customer.mjs
│   ├── cleanup-duplicate-users.mjs
│   └── reset-workflow-passwords.mjs
│
├── Database
│   ├── db-reset-clean.sh
│   ├── clear-all-orders.mjs
│   ├── clear-all-orders.sql
│   └── wipe-workflow-data.mjs
│
├── Pricing & Scraping
│   ├── run-price-scraper.ts
│   ├── run-safe-scrape-check.ts
│   ├── run-full-catalog-pricing-audit.ts
│   ├── bootstrap-pricing-model.ts
│   ├── seed-pricing-training-data.ts
│   ├── test-pricing-pipeline.ts
│   ├── verify-pricing-quotes.ts
│   ├── refresh-device-competitor-prices.ts
│   ├── reconcile-market-trade-prices.ts
│   ├── audit-competitor-prices.ts
│   ├── audit-approved-pricing-policy.ts
│   ├── audit-fuzzy-device-names.ts
│   ├── cleanup-fuzzy-device-aliases.ts
│   ├── cleanup-duplicate-devices.ts
│   ├── normalize-competitor-names.ts
│   └── set-pricing-defaults.mjs
│
├── Scraper Validation
│   ├── validate-bell-scrapling.ts
│   ├── validate-telus-scrapling.ts
│   ├── validate-univercell-scrapling.ts
│   ├── validate-gorecell-scrapling.ts
│   ├── validate-apple-scrapling.ts
│   ├── validate-scrapling-rollout.ts
│   ├── burnin-scrapling-dual.ts
│   └── test-scrapers.ts
│
├── Debug & Discovery
│   ├── discover-telus-endpoints.ts
│   ├── discover-univercell-actions.ts
│   ├── debug-telus.ts
│   ├── debug-univercell-api.ts
│   └── debug-univercell.ts
│
├── AI Pricing Agents
│   ├── agents/agent1-full-catalog.ts
│   ├── agents/agent2-condition-matrix.ts
│   ├── agents/agent3-input-normalization.ts
│   ├── agents/agent4-regression.ts
│   ├── agents/integrator.ts
│   ├── agents/telus-live-gate.ts
│   └── agents/README.md
│
└── E2E & QA
    ├── browser-workflow-audit.ts
    ├── capture-design-screens.mjs
    ├── live-admin-setup.mjs
    ├── live-workflow-check.mjs
    ├── check-launch-readiness.ts
    ├── send-test-email.ts
    └── verify-login.mjs
```

---

## Key File Size Reference

| File | Lines | Purpose |
|---|---|---|
| `src/app/(dashboard)/orders/[id]/_client.tsx` | ~3000 | Order detail page (full UI + actions) |
| `src/types/index.ts` | 978 | All TypeScript types |
| `src/lib/constants.ts` | 810 | App-wide constants |
| `src/services/order.service.ts` | ~600 | Order business logic |
| `src/services/notification.service.ts` | ~500 | Notification delivery |
| `src/services/pricing.service.ts` | ~400 | Market-referenced pricing |
| `src/hooks/useAuth.ts` | ~350 | Authentication state |
| `src/hooks/useOrders.ts` | 244 | Order queries + mutations |
| `src/app/(dashboard)/orders/new/page.tsx` | ~1340 | Unified order creation |
| `src/proxy.ts` | 153 | Middleware routing |
| `src/lib/supabase/require-auth.ts` | 77 | API auth guard |
