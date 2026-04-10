# Testing Guide — DLM Engine

## Quick Start

### 0. Install Playwright browsers (first-time only)
```bash
npx playwright install
```

### 1. Seed test users (required for E2E)
```bash
npm run seed-test-users
npm run seed-org-customer
```
- **Internal users** (admin, coemgr, coetech, sales) — use Login ID + `Test123!`
- **Organization login** — `customer-org` for the org-linked customer. Always use org-linked logins; avoid generic `customer` or `vendor` as they have no organization.

**If app runs on a different port** (e.g. 3001), set: `PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e`

### 2. Start the app
```bash
npm run dev
```
App must run on `http://localhost:3000` for E2E tests.

### 3. Run tests

| Command | Description |
|---------|-------------|
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright) |
| `npm run test:e2e:ui` | E2E tests with UI mode |
| `npx playwright test auth` | Run only auth tests |
| `npx playwright test role-access` | Run only role-access tests |
| `npx playwright test flows` | Run only flow tests |

### 4. Manual testing
Use **docs/TESTING_CHECKLIST.md** for exhaustive manual testing of every feature, section, and toggle.

---

## E2E Test Structure

| Spec | Coverage |
|------|----------|
| `auth.spec.ts` | Login, logout, unauthenticated redirect, invalid credentials |
| `role-access.spec.ts` | Role-based route access for all 6 roles |
| `flows.spec.ts` | Critical flows: orders, customer, vendor, COE, admin |
| `full-role-coverage.spec.ts` | Every role × every allowed/denied page + key section smoke tests |

---

## Unit Tests

```bash
npm run test:unit        # Run once
npm run test:unit:watch  # Watch mode
npm run test:smoke       # Verbose output
```

---

## CI

E2E tests expect:
- `npm run dev` running (or deploy URL via `baseURL`)
- Supabase configured (`.env.local`)
- Test users seeded (`npm run seed-test-users`)

For CI, run `npm run seed-test-users` before E2E, and ensure the app is up (e.g. `npm run build && npm run start` or a deployed URL).
