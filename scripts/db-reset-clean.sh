#!/usr/bin/env bash
# =============================================================================
# Clean Database Reset Script
# =============================================================================
# Resets the database to a clean state by:
# 1. Dropping all tables and data
# 2. Re-running all migrations in order
# 3. Running seed data (device catalog, pricing)
#
# Requirements:
#   - Docker Desktop running (Supabase local uses Docker)
#   - Supabase CLI installed
#
# Usage:
#   ./scripts/db-reset-clean.sh           # Reset LOCAL database only
#   ./scripts/db-reset-clean.sh --remote   # Reset REMOTE database (prompts for confirmation)
# =============================================================================

set -e
cd "$(dirname "$0")/.."

echo "=== Device Lifecycle Management - Database Reset ==="
echo ""

if [[ "$1" == "--remote" ]]; then
  echo "WARNING: This will RESET the REMOTE database."
  echo "All data will be destroyed and migrations will be re-applied."
  echo ""
  read -p "Type 'yes' to continue: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
  supabase db reset --linked
  echo ""
  echo "Remote database reset complete."
else
  echo "Resetting LOCAL database..."
  echo "(Ensure Docker Desktop is running)"
  echo ""
  supabase db reset
  echo ""
  echo "Local database reset complete."
  echo "  API URL: http://localhost:54321"
  echo "  DB URL:  postgresql://postgres:postgres@localhost:54322/postgres"
fi
