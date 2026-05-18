# PROJECT QUICK START
## Device Lifecycle Management Engine

> **Goal:** Get a new developer running locally in under 15 minutes.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ (LTS) | 20 recommended |
| npm | 9+ | Included with Node |
| Python | 3.11+ | For scrapers only |
| Git | Any | |
| Supabase CLI | Latest | `npm i -g supabase` |

---

## 1. Clone & Install

```bash
git clone <repo-url> Device-lifecycle-management-engine
cd Device-lifecycle-management-engine
npm install
```

---

## 2. Environment Variables

Copy the example and fill in real values:

```bash
cp .env.example .env.local
```

**Minimum required to run locally:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**For email to work:**
```env
RESEND_API_KEY=re_...          # OR
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

**For scrapers to work:**
```env
SCRAPER_BELL_ENABLED=true
SCRAPER_GORECELL_ENABLED=true
SCRAPER_APPLE_ENABLED=true
SCRAPER_TELUS_ENABLED=false    # requires Python scrapling env
```

See `API_AND_ENV_SETUP.md` for the full variable list.

---

## 3. Database Setup

The project uses **Supabase** (hosted Postgres + Auth + Realtime).

### Option A — Use Existing Supabase Project (Recommended for continuation)
1. Get credentials from the project owner
2. Put them in `.env.local`
3. Skip migration steps — DB is already migrated

### Option B — Fresh Supabase Project
```bash
# Link to your project
supabase link --project-ref <your-project-ref>

# Push all 52 migrations
supabase db push

# Seed test data
node scripts/seed-test-users.mjs
```

---

## 4. Run Development Server

```bash
npm run dev
```

App starts at **http://localhost:3000**

---

## 5. Default Test Accounts

| Role | Email | Password | Access |
|---|---|---|---|
| Admin | admin@dlm.local | Admin1234! | Full system |
| COE Manager | coe@dlm.local | Admin1234! | COE workflow |
| Sales | sales@dlm.local | Admin1234! | Order creation |
| Customer | customer@dlm.local | Admin1234! | Customer portal |
| Vendor | vendor@dlm.local | Admin1234! | Vendor portal |

> If these don't exist yet: `node scripts/seed-test-users.mjs`

---

## 6. Key URLs After Login

| Path | Who Sees It |
|---|---|
| `/dashboard` | Admin, COE, Sales |
| `/orders` | All internal roles |
| `/orders/new` | Admin, COE, Sales, Customer |
| `/customer/orders` | Customer, Vendor |
| `/vendor/orders` | Vendor |
| `/admin/users` | Admin only |
| `/admin/pricing` | Admin only |
| `/coe/receiving` | COE Manager, COE Tech |
| `/devices` | Admin, COE Manager |
| `/reports` | Admin, COE Manager |

---

## 7. Build for Production

```bash
npm run build
npm run start
```

Or deploy to Vercel:
```bash
vercel deploy
```

---

## 8. Python Scrapers (Optional)

Required only if you need Bell/Telus/UniverCell price scraping with bot-evasion:

```bash
cd scrapers_py
python3 -m venv .venv-scrapling
source .venv-scrapling/bin/activate
pip install -r requirements.txt
playwright install chromium
```

Test a scraper:
```bash
echo '{"devices":[{"make":"Apple","model":"iPhone 15","storage":"128GB"}]}' | python bell_worker.py
```

---

## 9. Common Commands

```bash
npm run dev                        # Start dev server (Turbopack)
npm run build                      # Production build
npm run lint                       # ESLint check
npx tsc --noEmit                   # TypeScript type check
npm run test                       # Run Vitest unit tests
npm run test:e2e                   # Run Playwright E2E tests

# Price scrapers
npx ts-node scripts/run-price-scraper.ts

# User management
node scripts/create-admin-user.mjs
node scripts/seed-test-users.mjs

# Pricing
npx ts-node scripts/bootstrap-pricing-model.ts
```

---

## 10. Architecture in 30 Seconds

```
Browser → Next.js App Router (src/app/)
         → Middleware (src/proxy.ts) — role-based routing, cookie fast-path
         → API Routes (src/app/api/) — REST endpoints
         → Services (src/services/) — business logic
         → Supabase (PostgreSQL + RLS + Auth + Realtime)

Frontend State:
  React Query (TanStack Query v5) for server state
  useAuth hook for auth state (with localStorage cache + cookies)
  Supabase Realtime for live updates

6 Roles: admin | coe_manager | coe_tech | sales | customer | vendor
Each role has restricted UI paths + API-level data scoping
```
