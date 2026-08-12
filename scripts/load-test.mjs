#!/usr/bin/env node
// ============================================================================
// LOAD TEST HARNESS — dependency-free (Node 18+ global fetch)
// ============================================================================
// Drives sustained concurrent traffic at a target endpoint and reports the
// numbers that actually tell you whether the system scales: throughput (req/s),
// error rate, and latency percentiles (p50/p90/p95/p99/max).
//
// It keeps CONCURRENCY requests in flight for DURATION seconds (a closed-loop
// worker pool), which mimics real load far better than firing N requests at once.
//
// USAGE
//   node scripts/load-test.mjs --url <URL> [options]
//   TARGET_URL=<URL> node scripts/load-test.mjs
//
// OPTIONS (flag or env)
//   --url         TARGET_URL     endpoint to hit (required)
//   --concurrency CONCURRENCY    parallel in-flight requests   (default 50)
//   --duration    DURATION_SEC   seconds to sustain load       (default 20)
//   --method      METHOD         HTTP method                   (default GET)
//   --body        BODY           request body (implies POST if method unset)
//   --header      HEADER         'Key: Value' (repeatable)
//   --rps-cap     RPS_CAP        optional max requests/sec (throttle)
//
// SAFETY
//   Point this at STAGING or a local dev server. Do NOT hammer production —
//   you will trip rate limits and create real load. Prefer read-only endpoints
//   (e.g. /api/public/device-search) unless you deliberately want write load.
// ============================================================================

function parseArgs(argv) {
  const out = { headers: [] }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--url') out.url = next()
    else if (a === '--concurrency') out.concurrency = Number(next())
    else if (a === '--duration') out.duration = Number(next())
    else if (a === '--method') out.method = next()
    else if (a === '--body') out.body = next()
    else if (a === '--header') out.headers.push(next())
    else if (a === '--rps-cap') out.rpsCap = Number(next())
  }
  return out
}

const args = parseArgs(process.argv)
const URL_ = args.url || process.env.TARGET_URL
const CONCURRENCY = args.concurrency || Number(process.env.CONCURRENCY) || 50
const DURATION = args.duration || Number(process.env.DURATION_SEC) || 20
const BODY = args.body ?? process.env.BODY
const METHOD = (args.method || process.env.METHOD || (BODY ? 'POST' : 'GET')).toUpperCase()
const RPS_CAP = args.rpsCap || Number(process.env.RPS_CAP) || 0

if (!URL_) {
  console.error('Error: --url (or TARGET_URL) is required.\nExample: node scripts/load-test.mjs --url http://localhost:3000/api/public/device-search?q=iphone --concurrency 50 --duration 20')
  process.exit(1)
}

const headers = { 'Content-Type': 'application/json' }
for (const h of args.headers) {
  const idx = h.indexOf(':')
  if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim()
}

const latencies = []
const statusCounts = new Map()
let errors = 0
let sent = 0
const startedAt = Date.now()
const deadline = startedAt + DURATION * 1000
// Global throttle spacing (ms between request starts) if an rps cap is set.
const minSpacingMs = RPS_CAP > 0 ? 1000 / RPS_CAP : 0
let nextSlot = startedAt

async function oneRequest() {
  const t0 = performance.now()
  try {
    const res = await fetch(URL_, {
      method: METHOD,
      headers,
      body: METHOD === 'GET' || METHOD === 'HEAD' ? undefined : BODY,
    })
    // Drain the body so the socket can be reused (keep-alive).
    await res.arrayBuffer().catch(() => {})
    statusCounts.set(res.status, (statusCounts.get(res.status) || 0) + 1)
    if (res.status >= 500) errors++
  } catch {
    errors++
    statusCounts.set('network_error', (statusCounts.get('network_error') || 0) + 1)
  } finally {
    latencies.push(performance.now() - t0)
  }
}

async function worker() {
  while (Date.now() < deadline) {
    if (minSpacingMs > 0) {
      const now = Date.now()
      if (now < nextSlot) await sleep(nextSlot - now)
      nextSlot = Math.max(nextSlot + minSpacingMs, Date.now())
    }
    sent++
    await oneRequest()
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function pct(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

// Live progress line so long runs aren't silent.
const ticker = setInterval(() => {
  const elapsed = (Date.now() - startedAt) / 1000
  process.stdout.write(`\r  ${elapsed.toFixed(0)}s  ${sent} sent  ${latencies.length} done  ${errors} err   `)
}, 1000)

console.log(`\nLoad test → ${METHOD} ${URL_}`)
console.log(`  concurrency=${CONCURRENCY}  duration=${DURATION}s${RPS_CAP ? `  rps_cap=${RPS_CAP}` : ''}\n`)

await Promise.all(Array.from({ length: CONCURRENCY }, worker))
clearInterval(ticker)

const wallSec = (Date.now() - startedAt) / 1000
const done = latencies.length
const sorted = latencies.slice().sort((a, b) => a - b)
const mean = done ? latencies.reduce((s, x) => s + x, 0) / done : 0

console.log(`\r${' '.repeat(50)}`)
console.log('─'.repeat(48))
console.log(`Requests completed : ${done}`)
console.log(`Throughput         : ${(done / wallSec).toFixed(1)} req/s`)
console.log(`Error rate         : ${done ? ((errors / done) * 100).toFixed(2) : '0'}%  (${errors} errors)`)
console.log('Latency (ms)')
console.log(`  mean : ${mean.toFixed(1)}`)
console.log(`  p50  : ${pct(sorted, 50).toFixed(1)}`)
console.log(`  p90  : ${pct(sorted, 90).toFixed(1)}`)
console.log(`  p95  : ${pct(sorted, 95).toFixed(1)}`)
console.log(`  p99  : ${pct(sorted, 99).toFixed(1)}`)
console.log(`  max  : ${(sorted[sorted.length - 1] || 0).toFixed(1)}`)
console.log('Status codes')
for (const [code, n] of [...statusCounts.entries()].sort()) {
  console.log(`  ${code} : ${n}`)
}
console.log('─'.repeat(48))

// Non-zero exit if the endpoint was unhealthy under load, so CI can gate on it.
const errRate = done ? errors / done : 1
process.exit(errRate > 0.01 ? 1 : 0)
