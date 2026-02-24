# Device Lifecycle Management Engine (DLME)

Enterprise platform for ITAD (IT Asset Disposition) device lifecycle management.

## Project Structure

```
src/
├── app/                    # Next.js 14 App Router
│   ├── (auth)/            # Auth pages (login, register, forgot-password)
│   ├── (customer)/        # Customer portal pages
│   ├── (dashboard)/       # Main dashboard pages
│   │   ├── admin/         # Admin pages (users, pricing, SLA rules, audit)
│   │   ├── coe/           # COE pages (receiving, triage, shipping, exceptions)
│   │   ├── customers/     # Customer management
│   │   ├── devices/       # Device catalog
│   │   ├── notifications/ # Notifications page
│   │   ├── orders/        # Order management
│   │   ├── reports/       # Reports and analytics
│   │   └── vendors/       # Vendor management
│   ├── (vendor)/          # Vendor portal pages
│   └── api/               # API route handlers
│       ├── auth/          # Authentication endpoints
│       ├── cron/          # Cron job endpoints (SLA check)
│       ├── customers/     # Customer CRUD
│       ├── devices/       # Device CRUD
│       ├── imei/          # IMEI lookup and tracking
│       ├── notifications/ # Notifications endpoints
│       ├── orders/        # Order CRUD and transitions
│       ├── organizations/ # Organization management
│       ├── pricing/       # Pricing calculations
│       ├── shipments/     # Shipment tracking
│       ├── triage/        # Triage operations
│       ├── users/         # User management
│       └── vendors/       # Vendor CRUD
├── components/
│   ├── auth/              # Auth components
│   ├── coe/               # COE-specific components
│   ├── customers/         # Customer components
│   ├── dashboard/         # Dashboard widgets
│   ├── devices/           # Device components
│   ├── layout/            # Layout components (Sidebar, Header)
│   ├── orders/            # Order components
│   ├── shared/            # Shared components
│   ├── ui/                # shadcn/ui base components
│   └── vendors/           # Vendor components
├── hooks/                 # React hooks
│   ├── useAuth.ts        # Authentication hook
│   ├── useCustomers.ts   # Customer data hook
│   ├── useNotifications.ts # Notifications hook
│   ├── useOrders.ts      # Order data hook
│   └── useVendors.ts     # Vendor data hook
├── lib/
│   ├── supabase/         # Supabase client configurations
│   ├── constants.ts      # App constants and config
│   ├── utils.ts          # Utility functions
│   └── validations.ts    # Zod validation schemas
├── services/             # Business logic services
│   ├── audit.service.ts  # Audit logging
│   ├── auth.service.ts   # Authentication
│   ├── customer.service.ts
│   ├── device.service.ts
│   ├── imei.service.ts   # IMEI tracking
│   ├── notification.service.ts
│   ├── order.service.ts  # Order management + state machine
│   ├── pricing.service.ts # Pricing calculations
│   ├── shipment.service.ts
│   ├── sla.service.ts    # SLA monitoring
│   ├── triage.service.ts # Device triage
│   └── vendor.service.ts
├── types/                # TypeScript type definitions
│   └── index.ts
└── middleware.ts         # Next.js middleware (auth, routing)

supabase/
└── migrations/           # Database migrations
    └── 20240101000000_initial_schema.sql

tests/
├── e2e/                  # End-to-end tests
└── unit/                 # Unit tests
```

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in values
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run database migrations:
   ```bash
   npx supabase db push
   ```
5. Start development server:
   ```bash
   npm run dev
   ```

## Key Features

### Order Types
- **Trade-In**: Customer sells devices to company
- **CPO (Certified Pre-Owned)**: Company purchases devices from vendors for customers

### Order State Machine
```
DRAFT → SUBMITTED → QUOTED → ACCEPTED → SOURCING → SOURCED → 
SHIPPED_TO_COE → RECEIVED → IN_TRIAGE → QC_COMPLETE → 
READY_TO_SHIP → SHIPPED → DELIVERED → CLOSED
```

### Pricing Logic
```
Final Price = (Base Price × Condition Multiplier) - Functional Deductions - Costs - Profit Target
```

Condition Multipliers:
- New: 100%
- Excellent: 90%
- Good: 80%
- Fair: 65%
- Poor: 40%

### IMEI Tracking
Each device is tracked by IMEI through the entire lifecycle, linked to source vendor for warranty liability.

### SLA Monitoring
Configurable SLA rules per order status with warning and breach thresholds. Automated notifications on SLA warnings/breaches.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Styling**: TailwindCSS + shadcn/ui
- **Forms**: React Hook Form + Zod
- **State**: TanStack Query
- **Charts**: Recharts
- **CSV Parsing**: PapaParse

## User Roles

- **Admin**: Full system access
- **COE Manager**: COE operations management
- **COE Tech**: Receiving, triage, shipping
- **Sales**: Customer/vendor/order management
- **Customer**: Customer portal access
- **Vendor**: Vendor portal access
