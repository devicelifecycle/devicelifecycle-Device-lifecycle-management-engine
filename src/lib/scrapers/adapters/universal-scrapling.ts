import { spawn } from 'node:child_process'
import path from 'node:path'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { redactWorkerLogs } from './scrapling-worker-utils'

export type UniverCellScraperImpl = 'ts' | 'scrapling' | 'dual'

const COMPETITOR_NAME = 'UniverCell'
const DEFAULT_TARGETED_TIMEOUT_MS = 90_000
const DEFAULT_DISCOVERY_TIMEOUT_MS = 180_000

type WorkerResponse = ScraperResult
type ComparisonSummary = {
  ts_count: number
  scrapling_count: number
  overlapping_keys: number
  ts_only_count: number
  scrapling_only_count: number
  compared_price_pairs: number
  average_trade_in_delta: number
  max_trade_in_delta: number
  mismatch_samples: Array<{
    key: string
    ts_trade_in_price: number | null
    scrapling_trade_in_price: number | null
    delta: number
  }>
}

function isValidCondition(value: unknown): value is NonNullable<ScrapedPrice['condition']> {
  return value === 'excellent' || value === 'good' || value === 'fair' || value === 'broken'
}

function isValidPriceRow(value: unknown): value is ScrapedPrice {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  const tradeIn = row.trade_in_price
  const sell = row.sell_price

  return (
    row.competitor_name === COMPETITOR_NAME &&
    typeof row.make === 'string' &&
    typeof row.model === 'string' &&
    typeof row.storage === 'string' &&
    typeof row.scraped_at === 'string' &&
    (tradeIn == null || typeof tradeIn === 'number') &&
    (sell == null || typeof sell === 'number') &&
    (row.condition == null || isValidCondition(row.condition))
  )
}

function parseWorkerResponse(raw: string): WorkerResponse {
  const candidate = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => line.startsWith('{') && line.endsWith('}'))

  if (!candidate) {
    throw new Error('Worker did not emit a JSON response')
  }

  const parsed = JSON.parse(candidate) as Record<string, unknown>
  const prices = Array.isArray(parsed.prices) ? parsed.prices : []

  if (parsed.competitor_name !== COMPETITOR_NAME) {
    throw new Error(`Unexpected worker competitor name: ${String(parsed.competitor_name)}`)
  }
  if (typeof parsed.success !== 'boolean') {
    throw new Error('Worker response missing boolean success')
  }
  if (typeof parsed.duration_ms !== 'number') {
    throw new Error('Worker response missing numeric duration_ms')
  }
  if (!prices.every(isValidPriceRow)) {
    throw new Error('Worker returned invalid price rows')
  }

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
  const tsOnlyKeys = Array.from(tsKeys).filter((key) => !scraplingKeys.has(key))
  const scraplingOnlyKeys = Array.from(scraplingKeys).filter((key) => !tsKeys.has(key))

  const deltas: number[] = []
  const mismatchSamples: ComparisonSummary['mismatch_samples'] = []

  for (const key of overlappingKeys) {
    const tsPrice = tsMap.get(key)
    const scraplingPrice = scraplingMap.get(key)
    const tsTradeIn = tsPrice?.trade_in_price ?? null
    const scraplingTradeIn = scraplingPrice?.trade_in_price ?? null
    if (tsTradeIn == null || scraplingTradeIn == null) continue
    const delta = roundMetric(Math.abs(tsTradeIn - scraplingTradeIn))
    deltas.push(delta)
    if (delta > 0 && mismatchSamples.length < 10) {
      mismatchSamples.push({
        key,
        ts_trade_in_price: tsTradeIn,
        scrapling_trade_in_price: scraplingTradeIn,
        delta,
      })
    }
  }

  const averageDelta = deltas.length > 0 ? roundMetric(deltas.reduce((sum, value) => sum + value, 0) / deltas.length) : 0
  const maxDelta = deltas.length > 0 ? roundMetric(Math.max(...deltas)) : 0

  return {
    ts_count: tsResult.prices.filter((price) => price.trade_in_price != null || price.sell_price != null).length,
    scrapling_count: scraplingResult.prices.filter((price) => price.trade_in_price != null || price.sell_price != null).length,
    overlapping_keys: overlappingKeys.length,
    ts_only_count: tsOnlyKeys.length,
    scrapling_only_count: scraplingOnlyKeys.length,
    compared_price_pairs: deltas.length,
    average_trade_in_delta: averageDelta,
    max_trade_in_delta: maxDelta,
    mismatch_samples: mismatchSamples,
  }
}

export function getUniverCellScraperImpl(): UniverCellScraperImpl {
  const raw = (process.env.SCRAPER_UNIVERCELL_IMPL || 'scrapling').trim().toLowerCase()
  if (raw === 'scrapling' || raw === 'dual' || raw === 'ts') return raw
  return 'scrapling'
}

function getWorkerScriptPath(): string {
  return path.join(process.cwd(), 'scrapers_py', 'univercell_worker.py')
}

function getPythonBin(): string {
  if (process.env.SCRAPLING_PYTHON_BIN) return process.env.SCRAPLING_PYTHON_BIN
  const localVenvPython = path.join(process.cwd(), '.venv-scrapling', 'bin', 'python')
  return localVenvPython
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
    'PLAYWRIGHT_BROWSERS_PATH',
    'DEBUG',
    'UNIVERCELL_ACTION_URL',
    'UNIVERCELL_ACTION_GET_DEVICE_TYPES',
    'UNIVERCELL_ACTION_GET_MAKES_FOR_DEVICE_TYPE',
    'UNIVERCELL_ACTION_GET_MODELS_FOR_MAKE_AND_TYPE',
    'SCRAPLING_PYTHON_BIN',
    'SCRAPLING_WORKER_TIMEOUT_MS',
  ] as const

  const env = {} as NodeJS.ProcessEnv
  for (const key of allowedKeys) {
    const value = process.env[key]
    if (value != null && value !== '') env[key] = value
  }
  return env
}

export async function runUniverCellScraplingWorker(
  devices: DeviceToScrape[],
  discovery = false
): Promise<ScraperResult> {
  const start = Date.now()
  const workerPath = getWorkerScriptPath()
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

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

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
        if (code !== 0 && !parsed.error) {
          parsed.error = `Scrapling worker exited with code ${code}`
        }
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

    child.stdin.write(
      JSON.stringify({
        mode: discovery ? 'discovery' : 'targeted',
        devices,
      })
    )
    child.stdin.end()
  })
}

export async function runUniverCellScraperPilot(options: {
  devices: DeviceToScrape[]
  discovery?: boolean
  runTypeScript: () => Promise<ScraperResult>
}): Promise<ScraperResult> {
  const impl = getUniverCellScraperImpl()
  const discovery = options.discovery === true

  if (impl === 'ts') {
    return options.runTypeScript()
  }

  if (impl === 'scrapling') {
    return runUniverCellScraplingWorker(options.devices, discovery)
  }

  const [tsResult, scraplingResult] = await Promise.all([
    options.runTypeScript(),
    runUniverCellScraplingWorker(options.devices, discovery),
  ])
  const comparison = compareScraperResults(tsResult, scraplingResult)

  console.info(
    '[scraper:univercell:dual]',
    JSON.stringify({
      implementation_returned: 'ts',
      ts_success: tsResult.success,
      scrapling_success: scraplingResult.success,
      scrapling_error: scraplingResult.error,
      comparison,
    })
  )

  return tsResult
}

export const __internal = {
  compareScraperResults,
  getWorkerEnv,
  parseWorkerResponse,
}
