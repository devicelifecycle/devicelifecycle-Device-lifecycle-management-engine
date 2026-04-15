import { spawn } from 'node:child_process'
import path from 'node:path'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { redactWorkerLogs } from './scrapling-worker-utils'

export type GoRecellScraperImpl = 'ts' | 'scrapling' | 'dual'

const COMPETITOR_NAME = 'GoRecell'
const DEFAULT_TARGETED_TIMEOUT_MS = 90_000
const DEFAULT_DISCOVERY_TIMEOUT_MS = 180_000

type ComparisonSummary = {
  ts_count: number
  scrapling_count: number
  overlapping_keys: number
  ts_only_count: number
  scrapling_only_count: number
  compared_price_pairs: number
  average_trade_in_delta: number
  max_trade_in_delta: number
}

function pricedRowCount(result: ScraperResult): number {
  return result.prices.filter((price) => price.trade_in_price != null || price.sell_price != null).length
}

function getDualPreferredImplementation(): 'ts' | 'scrapling' {
  return (process.env.SCRAPER_DUAL_PREFER || 'scrapling').trim().toLowerCase() === 'ts' ? 'ts' : 'scrapling'
}

function isValidCondition(value: unknown): value is NonNullable<ScrapedPrice['condition']> {
  return value === 'excellent' || value === 'good' || value === 'fair' || value === 'broken'
}

function isValidPriceRow(value: unknown): value is ScrapedPrice {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    row.competitor_name === COMPETITOR_NAME &&
    typeof row.make === 'string' &&
    typeof row.model === 'string' &&
    typeof row.storage === 'string' &&
    typeof row.scraped_at === 'string' &&
    (row.trade_in_price == null || typeof row.trade_in_price === 'number') &&
    (row.sell_price == null || typeof row.sell_price === 'number') &&
    (row.condition == null || isValidCondition(row.condition))
  )
}

function parseWorkerResponse(raw: string): ScraperResult {
  const candidate = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => line.startsWith('{') && line.endsWith('}'))

  if (!candidate) throw new Error('Worker did not emit a JSON response')
  const parsed = JSON.parse(candidate) as Record<string, unknown>
  const prices = Array.isArray(parsed.prices) ? parsed.prices : []

  if (parsed.competitor_name !== COMPETITOR_NAME) throw new Error(`Unexpected worker competitor name: ${String(parsed.competitor_name)}`)
  if (typeof parsed.success !== 'boolean') throw new Error('Worker response missing boolean success')
  if (typeof parsed.duration_ms !== 'number') throw new Error('Worker response missing numeric duration_ms')
  if (!prices.every(isValidPriceRow)) throw new Error('Worker returned invalid price rows')

  return {
    competitor_name: COMPETITOR_NAME,
    prices,
    success: parsed.success,
    error: typeof parsed.error === 'string' ? parsed.error : undefined,
    duration_ms: parsed.duration_ms,
  }
}

function buildPriceKey(price: ScrapedPrice): string {
  return [
    (price.make || '').trim().toLowerCase(),
    (price.model || '').trim().toLowerCase(),
    (price.storage || '').trim().toLowerCase(),
    (price.condition || 'good').trim().toLowerCase(),
  ].join('|')
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100
}

function compareScraperResults(tsResult: ScraperResult, scraplingResult: ScraperResult): ComparisonSummary {
  const tsMap = new Map(tsResult.prices.map((price) => [buildPriceKey(price), price]))
  const scraplingMap = new Map(scraplingResult.prices.map((price) => [buildPriceKey(price), price]))

  const tsKeys = new Set(tsMap.keys())
  const scraplingKeys = new Set(scraplingMap.keys())
  const overlappingKeys = Array.from(tsKeys).filter((key) => scraplingKeys.has(key))

  const deltas: number[] = []
  for (const key of overlappingKeys) {
    const left = tsMap.get(key)?.trade_in_price
    const right = scraplingMap.get(key)?.trade_in_price
    if (left == null || right == null) continue
    deltas.push(Math.abs(left - right))
  }

  return {
    ts_count: tsResult.prices.filter((price) => price.trade_in_price != null || price.sell_price != null).length,
    scrapling_count: scraplingResult.prices.filter((price) => price.trade_in_price != null || price.sell_price != null).length,
    overlapping_keys: overlappingKeys.length,
    ts_only_count: Array.from(tsKeys).filter((key) => !scraplingKeys.has(key)).length,
    scrapling_only_count: Array.from(scraplingKeys).filter((key) => !tsKeys.has(key)).length,
    compared_price_pairs: deltas.length,
    average_trade_in_delta: deltas.length > 0 ? roundMetric(deltas.reduce((sum, value) => sum + value, 0) / deltas.length) : 0,
    max_trade_in_delta: deltas.length > 0 ? roundMetric(Math.max(...deltas)) : 0,
  }
}

export function getGoRecellScraperImpl(): GoRecellScraperImpl {
  const raw = (process.env.SCRAPER_GORECELL_IMPL || 'ts').trim().toLowerCase()
  if (raw === 'ts' || raw === 'scrapling' || raw === 'dual') return raw
  return 'ts'
}

function getWorkerScriptPath(): string {
  return path.join(process.cwd(), 'scrapers_py', 'gorecell_worker.py')
}

function getPythonBin(): string {
  return process.env.SCRAPLING_PYTHON_BIN ?? 'python3'
}

function getWorkerTimeoutMs(discovery: boolean): number {
  const envValue = Number(process.env.SCRAPLING_WORKER_TIMEOUT_MS || '')
  if (Number.isFinite(envValue) && envValue > 0) return envValue
  return discovery ? DEFAULT_DISCOVERY_TIMEOUT_MS : DEFAULT_TARGETED_TIMEOUT_MS
}

function getWorkerEnv(): NodeJS.ProcessEnv {
  const allowedKeys = [
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NO_PROXY',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'DEBUG',
    'SCRAPLING_PYTHON_BIN',
    'SCRAPLING_WORKER_TIMEOUT_MS',
    'GORECELL_STORE_API',
    'GORECELL_PRODUCT_BASE',
  ] as const

  const env = {} as NodeJS.ProcessEnv
  for (const key of allowedKeys) {
    const value = process.env[key]
    if (value != null && value !== '') env[key] = value
  }
  return env
}

export async function runGoRecellScraplingWorker(
  devices: DeviceToScrape[],
  options?: { discovery?: boolean; limitProducts?: number }
): Promise<ScraperResult> {
  const start = Date.now()
  const workerPath = getWorkerScriptPath()
  const discovery = options?.discovery === true
  const timeoutMs = getWorkerTimeoutMs(discovery)

  return new Promise((resolve) => {
    const child = spawn(getPythonBin(), [workerPath], {
      cwd: process.cwd(),
      env: getWorkerEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: ScraperResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish({
        competitor_name: COMPETITOR_NAME,
        prices: [],
        success: false,
        error: `Scrapling worker timed out after ${timeoutMs}ms`,
        duration_ms: Date.now() - start,
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (error) => {
      clearTimeout(timeout)
      finish({
        competitor_name: COMPETITOR_NAME,
        prices: [],
        success: false,
        error: `Failed to start Scrapling worker: ${error.message}`,
        duration_ms: Date.now() - start,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (settled) return
      try {
        const parsed = parseWorkerResponse(stdout.trim())
        if (code !== 0 && !parsed.error) parsed.error = `Scrapling worker exited with code ${code}`
        finish(parsed)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown worker parse failure'
        finish({
          competitor_name: COMPETITOR_NAME,
          prices: [],
          success: false,
          error: [message, redactWorkerLogs(stderr)].filter(Boolean).join(' | '),
          duration_ms: Date.now() - start,
        })
      }
    })

    child.stdin.write(JSON.stringify({
      mode: discovery ? 'discovery' : 'targeted',
      devices,
      limit_products: options?.limitProducts,
    }))
    child.stdin.end()
  })
}

export async function runGoRecellScraperPilot(options: {
  devices: DeviceToScrape[]
  discovery?: boolean
  limitProducts?: number
  runTypeScript: () => Promise<ScraperResult>
}): Promise<ScraperResult> {
  const impl = getGoRecellScraperImpl()

  if (impl === 'ts') return options.runTypeScript()
  if (impl === 'scrapling') {
    return runGoRecellScraplingWorker(options.devices, {
      discovery: options.discovery,
      limitProducts: options.limitProducts,
    })
  }

  const [tsResult, scraplingResult] = await Promise.all([
    options.runTypeScript(),
    runGoRecellScraplingWorker(options.devices, {
      discovery: options.discovery,
      limitProducts: options.limitProducts,
    }),
  ])

  const comparison = compareScraperResults(tsResult, scraplingResult)
  const preferred = getDualPreferredImplementation()
  let selected: 'ts' | 'scrapling' = 'ts'

  if (scraplingResult.success && !tsResult.success) {
    selected = 'scrapling'
  } else if (tsResult.success && !scraplingResult.success) {
    selected = 'ts'
  } else if (scraplingResult.success && tsResult.success) {
    const tsCount = pricedRowCount(tsResult)
    const scraplingCount = pricedRowCount(scraplingResult)
    if (scraplingCount > tsCount) {
      selected = 'scrapling'
    } else if (tsCount > scraplingCount) {
      selected = 'ts'
    } else {
      selected = preferred
    }
  } else {
    selected = preferred
  }

  console.info(
    '[scraper:gorecell:dual]',
    JSON.stringify({
      implementation_returned: selected,
      ts_success: tsResult.success,
      scrapling_success: scraplingResult.success,
      scrapling_error: scraplingResult.error,
      comparison,
    })
  )

  return selected === 'scrapling' ? scraplingResult : tsResult
}

export const __internal = {
  compareScraperResults,
  getWorkerEnv,
  parseWorkerResponse,
}
