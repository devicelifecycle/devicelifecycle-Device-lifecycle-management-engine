#!/usr/bin/env bash
# =============================================================================
# Clean Database Reset Script (FAST by default)
# =============================================================================
# Default: Schema only (~1 min) - migrations, no seed
# Use --full for complete reset with device catalog + pricing (~2–4 min)
#
# Requirements: Docker Desktop running, Supabase CLI
#
# Usage:
#   ./scripts/db-reset-clean.sh              # FAST: schema only (default)
#   ./scripts/db-reset-clean.sh --full       # Full: migrations + seed data
#   ./scripts/db-reset-clean.sh --remote     # Reset REMOTE (prompts confirm)
# =============================================================================

set -e
cd "$(dirname "$0")/.."

echo "=== Device Lifecycle - Database Reset ==="
echo ""

# Quick Docker check - fail fast with clear message
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

if [[ "$1" == "--remote" ]]; then
  echo "WARNING: This will RESET the REMOTE database."
  read -p "Type 'yes' to continue: " confirm
  [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }
  supabase db reset --linked
  echo ""
  echo "Remote database reset complete."
elif [[ "$1" == "--full" ]]; then
  echo "Full reset (migrations + seed)... ~2–4 min"
  echo ""
  supabase db reset ${SUPABASE_DEBUG:+--debug}
  echo ""
  echo "Done. API: http://localhost:54321  DB: localhost:54322"
else
  echo "Fast reset (schema only, no seed)... ~1 min"
  echo ""
  supabase db reset --no-seed ${SUPABASE_DEBUG:+--debug}
  echo ""
  echo "Done. API: http://localhost:54321  DB: localhost:54322"
  echo "Tip: Use --full for complete reset with device/pricing data."
fi
