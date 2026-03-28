# Multi-Agent Testing Architecture

Pricing and scraper health validation via 4 agents + 1 integrator.

## Agents

| Agent | Purpose | Fail Conditions |
|-------|---------|-----------------|
| **1 — Full Catalog** | Run Bell/Telus/UniverCell/GoRecell full catalog scrapers (retry 3x each) | `success=false`, `count=0`, or missing conditions (excellent, good, fair, broken) |
| **2 — Condition Matrix** | For iPhone 15 Pro 128GB, run Bell/Telus/UniverCell for excellent/good/fair/broken | Any condition missing or value null |
| **3 — Input Normalization** | Validate typo normalization (exacellen, brokn, damaged, poor) via pricing + competitor normalizers | Mapping not deterministic to allowed enums |
| **4 — Regression** | Run pricing API and competitor-ordering unit tests | Any test failure |

## Integrator

Runs Agents 1–4, marks overall pass only if all pass, and publishes:

- JSON health summary
- Artifact paths: `.artifacts/agent-health/<timestamp>/*.json`

## Usage

```bash
# Run individual agents
npm run agent:1   # Full catalog (requires network, scrapers may hit rate limits)
npm run agent:2   # Condition matrix (requires network)
npm run agent:3   # Input normalization (no network)
npm run agent:4   # Regression tests
npm run agent:telus-live   # Strict Telus live gate (fails unless live Telus works)

# Run all via integrator
npm run agent:health
```

## Strict Telus Live Strategy

For strict production gating, Telus must pass live scraping. Telus may be blocked by Cloudflare without residential/datacenter egress that is accepted.

Environment variables for strict runs:

```bash
TELUS_ENABLE_BROWSER_RUNNER=true
TELUS_PROXY_SERVER=http://host:port
TELUS_PROXY_USERNAME=...
TELUS_PROXY_PASSWORD=...
```

Gate command:

```bash
npm run agent:telus-live
```

This gate exits non-zero until Telus live scraping returns catalog rows.

## Output

All agents output **JSON only** to stdout. Exit code 0 = pass, 1 = fail.

Integrator writes to `.artifacts/agent-health/<timestamp>/`:
- `agent1.json`, `agent2.json`, `agent3.json`, `agent4.json`
- `summary.json` — overall pass, agent statuses, artifact paths
