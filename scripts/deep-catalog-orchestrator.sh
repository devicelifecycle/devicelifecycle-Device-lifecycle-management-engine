#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR=".artifacts/deep-catalog/$STAMP"
mkdir -p "$OUT_DIR"

echo "== Deep Catalog Orchestrator =="
echo "Output: $OUT_DIR"

run_agent() {
  local name="$1"
  shift
  (
    set -euo pipefail
    echo "[$name] START"
    "$@"
    echo "[$name] PASS"
  ) >"$OUT_DIR/${name}.log" 2>&1 && echo "pass" >"$OUT_DIR/${name}.status" || {
    echo "fail" >"$OUT_DIR/${name}.status"
  }
}

# Run all agents in parallel
rm -f "$OUT_DIR"/*.status
pids=()

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
run_agent "agent_tests" npm run test -- tests/unit/api/pricing.calculate.route.test.ts tests/unit/services/pricing.service.competitor-ordering.test.ts & pids+=("$!")
run_agent "agent_condition_typo" npx tsx "$SCRIPT_DIR/deep-catalog/agent-condition-typo.ts" & pids+=("$!")
run_agent "agent_scenario_matrix" npx tsx "$SCRIPT_DIR/deep-catalog/agent-scenario-matrix.ts" & pids+=("$!")
run_agent "agent_full_catalog" npx tsx "$SCRIPT_DIR/deep-catalog/agent-full-catalog.ts" & pids+=("$!")

for pid in "${pids[@]}"; do
  wait "$pid" || true
done

echo
echo "== Agent Summary =="
failed=0
for s in "$OUT_DIR"/*.status; do
  agent="$(basename "$s" .status)"
  status="$(cat "$s" || true)"
  echo "- $agent: $status"
  if [[ "$status" != "pass" ]]; then
    failed=1
  fi
done

if [[ $failed -ne 0 ]]; then
  echo
  echo "One or more agents failed. Check logs in: $OUT_DIR"
  exit 1
fi

echo
echo "All agent tasks passed. Entire catalog goal is healthy."
