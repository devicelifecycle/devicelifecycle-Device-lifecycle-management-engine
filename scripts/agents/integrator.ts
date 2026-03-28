#!/usr/bin/env npx tsx
/**
 * Integrator Agent
 * Collect outputs from Agents 1–4, mark overall pass only if all pass,
 * and publish one final health summary + artifact paths.
 */

import { spawn } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const AGENTS = [
  { id: 'agent1', name: 'Full Catalog', script: join(__dirname, 'agent1-full-catalog.ts') },
  { id: 'agent2', name: 'Condition Matrix', script: join(__dirname, 'agent2-condition-matrix.ts') },
  { id: 'agent3', name: 'Input Normalization', script: join(__dirname, 'agent3-input-normalization.ts') },
  { id: 'agent4', name: 'Regression Tests', script: join(__dirname, 'agent4-regression.ts') },
] as const

interface AgentResult {
  id: string
  name: string
  pass: boolean
  output?: unknown
  error?: string
  duration_ms: number
}

async function runAgent(scriptPath: string): Promise<{ pass: boolean; output: string; duration_ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const proc = spawn('npx', ['tsx', scriptPath], {
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
      let parsed: { pass?: boolean } = {}
      try {
        const lastLine = output.trim().split('\n').pop()
        if (lastLine) parsed = JSON.parse(lastLine) as { pass?: boolean }
      } catch {
        /* ignore */
      }
      resolve({
        pass: code === 0 && parsed.pass !== false,
        output,
        duration_ms: Date.now() - start,
      })
    })

    proc.on('error', (err) => {
      resolve({
        pass: false,
        output: err.message,
        duration_ms: Date.now() - start,
      })
    })
  })
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const artifactsDir = join(process.cwd(), '.artifacts', 'agent-health', timestamp)
  mkdirSync(artifactsDir, { recursive: true })

  const results: AgentResult[] = []
  let overallPass = true

  for (const agent of AGENTS) {
    const { pass, output, duration_ms } = await runAgent(agent.script)
    if (!pass) overallPass = false

    let parsed: unknown
    try {
      const lastLine = output.trim().split('\n').pop()
      parsed = lastLine ? JSON.parse(lastLine) : null
    } catch {
      parsed = { raw: output }
    }

    const artifactPath = join(artifactsDir, `${agent.id}.json`)
    writeFileSync(artifactPath, JSON.stringify(parsed, null, 2))

    results.push({
      id: agent.id,
      name: agent.name,
      pass,
      output: parsed,
      duration_ms,
    })
  }

  const summary = {
    integrator: 'agent-health',
    timestamp: new Date().toISOString(),
    overall_pass: overallPass,
    agents: results.map((r) => ({
      id: r.id,
      name: r.name,
      pass: r.pass,
      duration_ms: r.duration_ms,
    })),
    artifact_paths: results.map((r) => join(artifactsDir, `${r.id}.json`)),
    artifacts_dir: artifactsDir,
  }

  writeFileSync(join(artifactsDir, 'summary.json'), JSON.stringify(summary, null, 2))

  console.log(JSON.stringify(summary, null, 0))
  process.exit(overallPass ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
