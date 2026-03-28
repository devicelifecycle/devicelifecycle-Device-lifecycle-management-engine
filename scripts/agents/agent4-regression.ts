#!/usr/bin/env npx tsx
/**
 * Agent 4 — Regression Tests
 * Run pricing API and competitor-ordering unit tests; fail on any error.
 * Return only pass/fail + failing test names.
 */

import { spawn } from 'child_process'

const TEST_FILES = [
  'tests/unit/api/pricing.calculate.route.test.ts',
  'tests/unit/api/pricing.competitors.export.route.test.ts',
  'tests/unit/services/pricing.service.competitor-ordering.test.ts',
]

async function runVitest(): Promise<{ pass: boolean; output: string; failingTests: string[] }> {
  return new Promise((resolvePromise) => {
    const args = ['vitest', 'run', '--reporter=verbose', ...TEST_FILES]
    const proc = spawn('npx', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d) => {
      stderr += d.toString()
    })

    proc.on('close', (code) => {
      const output = stdout + stderr
      const pass = code === 0
      const failingTests: string[] = []

      if (!pass) {
        const failMatch = output.match(/FAIL\s+(.+?)(?=\n|$)/g)
        if (failMatch) {
          failingTests.push(...failMatch.map((m) => m.replace(/^FAIL\s+/, '').trim()))
        }
        const assertMatch = output.match(/AssertionError[^\n]*\n[^\n]*at\s+(.+?)(?=\n|$)/g)
        if (assertMatch) {
          failingTests.push(...assertMatch.map((m) => m.split('\n')[1]?.trim() || m).filter(Boolean))
        }
        if (output.includes('FAIL ') && failingTests.length === 0) {
          const lineMatch = output.match(/(?:✓|✗)\s+(.+?)\s+(?:[\dms]+|passed|failed)/g)
          if (lineMatch) {
            failingTests.push(...lineMatch.filter((l) => l.startsWith('✗')).map((l) => l.replace(/^✗\s+/, '')))
          }
        }
      }

      resolvePromise({ pass, output, failingTests })
    })

    proc.on('error', (err) => {
      resolvePromise({
        pass: false,
        output: err.message,
        failingTests: [err.message],
      })
    })
  })
}

async function main() {
  const { pass, output, failingTests } = await runVitest()

  const outputLines = (output || '').split('\n')
  const failingTestNames = failingTests.length > 0 ? failingTests : outputLines.filter((l) => l.includes('FAIL') || l.includes('AssertionError')).slice(0, 5)

  const result = {
    agent: 'agent4-regression',
    timestamp: new Date().toISOString(),
    pass,
    failing_tests: failingTestNames,
    fail_reason: pass ? undefined : `Tests failed: ${failingTestNames.join(', ') || 'see output'}`,
  }

  console.log(JSON.stringify(result, null, 0))
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      agent: 'agent4-regression',
      timestamp: new Date().toISOString(),
      pass: false,
      failing_tests: [e instanceof Error ? e.message : String(e)],
      error: e instanceof Error ? e.message : String(e),
    })
  )
  process.exit(1)
})
