#!/usr/bin/env node
// ============================================================================
// Regression gate: distinguishes "100 tests have failed for unrelated reasons
// since before this session" from "your change just broke something new."
// A bare `vitest run` exit code can't tell those apart, which made it
// impossible to wire a real test gate into CI/deploy.ps1 without blocking
// every single deploy. Compares the current failing set against
// tests/known-failing-tests.json (committed snapshot) — exits 0 if every
// current failure is already known, exits 1 and prints exactly what's new
// otherwise. Also reports (without failing) any known failure that now
// passes, since that's good news worth re-snapshotting for.
//
// Usage: node scripts/check-test-regressions.mjs
// To accept new/fixed failures into the baseline: re-run the snapshot build
// (see tests/known-failing-tests.json's generation in dedupe history) and
// commit the updated file.
// ============================================================================

import { execSync } from 'child_process'
import fs from 'fs'

const RESULTS_FILE = './vitest-results-tmp-regression-check.json'
const SNAPSHOT_FILE = './tests/known-failing-tests.json'

function keyFor(file, fullName) {
  return `${file}::${fullName}`
}

console.log('Running test suite...')
try {
  execSync(`npx vitest run --reporter=json --outputFile=${RESULTS_FILE}`, { stdio: ['ignore', 'pipe', 'pipe'] })
} catch {
  // vitest exits non-zero whenever any test fails — expected here, the JSON
  // file is still written. Only a missing output file means a real crash.
}

if (!fs.existsSync(RESULTS_FILE)) {
  console.error('vitest did not produce a results file — treating as a hard failure.')
  process.exit(1)
}

const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'))
fs.unlinkSync(RESULTS_FILE)

const currentFailing = new Set()
for (const tr of results.testResults) {
  const relFile = tr.name.split(/[\\/]/).slice(-3).join('/')
  for (const ar of tr.assertionResults) {
    if (ar.status === 'failed') currentFailing.add(keyFor(relFile, ar.fullName))
  }
}

if (!fs.existsSync(SNAPSHOT_FILE)) {
  console.error(`No snapshot found at ${SNAPSHOT_FILE} — cannot check for regressions.`)
  process.exit(1)
}
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'))
const knownFailing = new Set(snapshot.tests.map(t => keyFor(t.file, t.fullName)))

const newFailures = [...currentFailing].filter(k => !knownFailing.has(k))
const nowPassing = [...knownFailing].filter(k => !currentFailing.has(k))

console.log(`Current failures: ${currentFailing.size} | Known baseline: ${knownFailing.size}`)

if (nowPassing.length > 0) {
  console.log(`\n${nowPassing.length} previously-known failure(s) now PASS (good news — consider re-snapshotting):`)
  for (const k of nowPassing) console.log(`  + ${k}`)
}

if (newFailures.length > 0) {
  console.error(`\n${newFailures.length} NEW test failure(s) not in the known baseline:`)
  for (const k of newFailures) console.error(`  ! ${k}`)
  process.exit(1)
}

console.log('\nNo new test regressions.')
process.exit(0)
