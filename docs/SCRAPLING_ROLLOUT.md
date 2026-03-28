# Scrapling Rollout

Date: 2026-03-25
Providers: UniverCell, Bell, Telus, GoRecell, Apple Trade-In

## Current Implementation

- TypeScript remains the default scraper path
- Scrapling runs in an isolated Python worker
- `SCRAPER_UNIVERCELL_IMPL` supports:
  - `ts`
  - `scrapling`
  - `dual`
- `SCRAPER_BELL_IMPL` supports:
  - `ts`
  - `scrapling`
  - `dual`
- `SCRAPER_APPLE_IMPL` supports:
  - `ts`
  - `scrapling`
  - `dual`
- `SCRAPER_GORECELL_IMPL` supports:
  - `ts`
  - `scrapling`
  - `dual`
- `SCRAPER_TELUS_IMPL` supports:
  - `ts`
  - `scrapling`
  - `dual`

## What Is Completed

- Security review documented
- Isolated worker environment created
- Pinned Scrapling install added
- Browser/runtime install verified
- Targeted lookup path verified through TypeScript wrapper for UniverCell
- Full-catalog discovery path verified through TypeScript wrapper for UniverCell
- Targeted lookup path verified through TypeScript wrapper for Bell
- Full-catalog discovery path verified through TypeScript wrapper for Bell
- Targeted lookup path verified through TypeScript wrapper for Apple Trade-In
- Targeted lookup path verified through TypeScript wrapper for GoRecell
- Full-catalog discovery path verified through TypeScript wrapper for GoRecell
- Targeted lookup path verified through TypeScript wrapper for Telus
- Full-catalog discovery path verified through TypeScript wrapper for Telus
- Dual-run comparison logging added
- Validation scripts added
- Worker env sanitized so Supabase secrets are not passed into the Python process

## Validation Commands

```bash
npm run check:launch
npx tsc --noEmit
npx vitest run tests/unit/lib/scrapers/universal-scrapling.test.ts --maxWorkers 1
npx vitest run tests/unit/lib/scrapers/bell-scrapling.test.ts --maxWorkers 1
npx vitest run tests/unit/lib/scrapers/apple-scrapling.test.ts --maxWorkers 1
npx vitest run tests/unit/lib/scrapers/gorecell-scrapling.test.ts --maxWorkers 1
npx vitest run tests/unit/lib/scrapers/telus-scrapling.test.ts --maxWorkers 1
npx tsx scripts/validate-scrapling-rollout.ts
npx tsx scripts/burnin-scrapling-dual.ts
npx tsx scripts/validate-univercell-scrapling.ts
npx tsx scripts/validate-bell-scrapling.ts
npx tsx scripts/validate-apple-scrapling.ts
npx tsx scripts/validate-gorecell-scrapling.ts
npx tsx scripts/validate-telus-scrapling.ts
```

## Rollout Health

- Aggregate admin health endpoint: `/api/health/scrapers`
- Legacy UniverCell source health endpoint: `/api/health/scrapers/universal`
- Launch readiness checker: `npm run check:launch`
- The price-scraper cron now persists per-provider:
  - last status
  - row count
  - duration
  - configured implementation
  - persisted implementation
  - last error

## Safe Rollout Sequence

1. Keep production on `SCRAPER_UNIVERCELL_IMPL=ts`
2. Keep production on `SCRAPER_BELL_IMPL=ts`
3. Keep production on `SCRAPER_APPLE_IMPL=ts`
4. Keep production on `SCRAPER_GORECELL_IMPL=ts`
5. Keep production on `SCRAPER_TELUS_IMPL=ts`
6. Run `npx tsx scripts/validate-scrapling-rollout.ts`
7. Run `npx tsx scripts/burnin-scrapling-dual.ts` in staging with `SCRAPLING_BURNIN_ROUNDS` set as needed
8. Enable `SCRAPER_UNIVERCELL_IMPL=dual` in staging
9. Enable `SCRAPER_BELL_IMPL=dual` in staging
10. Enable `SCRAPER_APPLE_IMPL=dual` in staging
11. Enable `SCRAPER_GORECELL_IMPL=dual` in staging
12. Enable `SCRAPER_TELUS_IMPL=dual` in staging
13. Review dual-run logs for:
   - row-count drift
   - max trade-in deltas
   - TS-only and Scrapling-only keys
14. If stable, enable:
   - `SCRAPER_UNIVERCELL_IMPL=scrapling`
   - `SCRAPER_BELL_IMPL=scrapling`
   - `SCRAPER_APPLE_IMPL=scrapling`
   - `SCRAPER_GORECELL_IMPL=scrapling`
   - `SCRAPER_TELUS_IMPL=scrapling`
15. Keep `ts` as the immediate rollback option

## Latest Validation Snapshot

- UniverCell:
  - targeted overlap `5/5`
  - discovery overlap `4976/4976`
  - max trade-in delta `0`
- Bell:
  - targeted overlap `4/4`
  - discovery overlap `816/816`
  - max trade-in delta `0`
- Apple Trade-In:
  - targeted overlap `4/4`
  - max trade-in delta `0`
  - targeted-only pilot because the Apple source is a single max-value page
- GoRecell:
  - targeted overlap `4/4`
  - discovery raw rows `5188/5188`
  - discovery canonical overlap `3940`
  - max trade-in delta `0.01`
- Telus:
  - targeted overlap `4/4`
  - discovery overlap `212/212`
  - max trade-in delta `0`

## Remaining Human/Operational Steps

- Stage dual-run burn-in over repeated scheduled runs for all five providers
- Monitor live logs during first production switch
- Decide whether to stop here or add a dedicated Apple catalog/discovery path later
