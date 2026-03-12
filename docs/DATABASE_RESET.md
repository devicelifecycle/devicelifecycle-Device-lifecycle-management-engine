# Database Reset & Clean Setup

This guide explains how to get a clean database without errors.

## Prerequisites

- **Local reset**: Docker Desktop running + Supabase CLI
- **Remote reset**: Supabase project linked (`supabase link`)

## Quick Reset (Local)

```bash
# 1. Start Docker Desktop
# 2. Run:
./scripts/db-reset-clean.sh
```

Or directly:

```bash
supabase db reset
```

This will:

1. Drop the local database
2. Recreate it
3. Run all migrations in order
4. Run seed data (`supabase/seed/pricing-data.sql`)

## Remote Database Reset

⚠️ **Destructive** – all remote data will be lost.

```bash
./scripts/db-reset-clean.sh --remote
```

Or:

```bash
supabase db reset --linked
```

## Recent Fixes Applied

1. **Order update** – `customer_notes` from the API is now correctly mapped to the `notes` column in the database.
2. **Seed data** – Migration `20240115000002_seed_test_data.sql` uses `notes` instead of `customer_notes` for order inserts (when uncommented).

## If Migrations Fail

1. Check migration order: `supabase/migrations/` files run in alphabetical order.
2. Verify dependencies: e.g. `update_updated_at_column()` is defined in `20260204_pricing_tables.sql` before it's used in `20260221_pricing_settings.sql`.
3. Run migrations one-by-one to find the failing file:

   ```bash
   supabase migration list
   supabase migration up  # or repair
   ```

## Schema Verification

After reset, you can verify the schema:

```bash
supabase db dump --schema public -f schema-check.sql
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| Docker not running | Start Docker Desktop |
| Port 54321/54322 in use | Stop other Supabase instances or change ports in `supabase/config.toml` |
| Migration fails | Check the failing migration file; fix and run `supabase migration repair` |
| Seed fails | Ensure `supabase/seed/pricing-data.sql` matches current schema |
