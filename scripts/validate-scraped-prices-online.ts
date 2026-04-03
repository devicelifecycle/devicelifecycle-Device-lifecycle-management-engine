import { scrapeApple } from '../src/lib/scrapers/adapters/apple'
import { scrapeBell, scrapeBellFullCatalog } from '../src/lib/scrapers/adapters/bell'
import { scrapeTelus, scrapeTelusFullCatalog } from '../src/lib/scrapers/adapters/telus'
import { scrapeUniversal, scrapeUniversalFullCatalog } from '../src/lib/scrapers/adapters/universal'
import { scrapeGoRecell, scrapeGoRecellFullCatalog } from '../src/lib/scrapers/adapters/gorecell'
import type { DeviceToScrape, ScrapedPrice } from '../src/lib/scrapers/types'
import { convertConditionPrice } from '../src/lib/scrapers/condition-pricing'

type Provider = 'Apple Trade-In' | 'Bell' | 'Telus' | 'UniverCell' | 'GoRecell'

const TEST_DEVICES: DeviceToScrape[] = [
  { make: 'Apple', model: 'iPhone 16 Pro Max', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 16 Pro', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 16', storage: '128GB', condition: 'good' },
  { make: 'Apple', model: 'iPad Pro', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'MacBook Air', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 14', storage: '128GB', condition: 'good' },
  { make: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB', condition: 'good' },
  { make: 'Samsung', model: 'Galaxy S23', storage: '128GB', condition: 'good' },
]

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeStorage(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function modelTokenMatch(left: string, right: string): boolean {
  if (left === right) return true
  if (left.startsWith(right)) {
    const nextChar = left[right.length]
    return nextChar === ' ' || nextChar === '-' || nextChar === undefined
  }
  return false
}

function pickBestCatalogMatch(device: DeviceToScrape, catalog: ScrapedPrice[]): ScrapedPrice | null {
  const modelToken = normalizeText(device.model)
  const makeToken = normalizeText(device.make)
  const storageToken = normalizeStorage(device.storage)
  const variantKeywords = ['max', 'plus', 'ultra', 'mini', 'fold', 'flip', 'fe', 'pro', 'e']

  const scored = catalog
    .map((entry) => {
      const model = normalizeText(entry.model)
      const make = normalizeText(entry.make)
      const storage = normalizeStorage(entry.storage)
      const exactModel = model === modelToken
      const deviceExtendsCandidate = modelToken !== model && modelTokenMatch(modelToken, model)
      const candidateExtendsDevice = model !== modelToken && modelTokenMatch(model, modelToken)

      let score = 0
      if (exactModel) score += 16
      if (makeToken && (make.includes(makeToken) || makeToken.includes(make))) score += 3
      if (deviceExtendsCandidate) score += 8
      if (candidateExtendsDevice) score -= 8
      if (storageToken && (storage.includes(storageToken) || storageToken.includes(storage))) score += 3

      for (const keyword of variantKeywords) {
        const deviceHas = modelToken.includes(keyword)
        const candidateHas = model.includes(keyword)
        if (deviceHas !== candidateHas) score -= 10
      }

      return { entry, score }
    })
    .filter((candidate) => candidate.score >= 10)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.entry || null
}

async function extractAppleLiveEntries(): Promise<Array<{ name: string; price: number }>> {
  const res = await fetch('https://www.apple.com/ca/shop/trade-in', {
    headers: { Accept: 'text/html' },
  })
  if (!res.ok) return []
  const html = await res.text()

  const patterns = [
    /(iPhone\s+\d+\s*(?:Pro\s*Max|Pro|Plus|e)?)[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(iPad\s+(?:Pro|Air|mini)?)[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(MacBook\s+(?:Pro|Air))[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(iMac)[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(Mac\s+(?:mini|Pro|Studio))[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(Apple\s+Watch\s+(?:Ultra\s*\d?|Series\s*\d+))[^$]*?Up\s+to\s+\$([\d,]+)/gi,
  ]

  const rows: Array<{ name: string; price: number }> = []
  const seen = new Set<string>()

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html)) !== null) {
      const name = match[1].replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
      const price = Number(match[2].replace(/,/g, ''))
      if (!Number.isFinite(price) || price <= 0) continue
      const key = `${name.toLowerCase()}|${price}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ name, price })
    }
  }

  return rows
}

function findAppleExpected(device: DeviceToScrape, entries: Array<{ name: string; price: number }>): number | null {
  const model = normalizeText(device.model)
  const match = entries
    .map((entry) => ({ ...entry, n: normalizeText(entry.name) }))
    .filter((entry) => entry.n.includes(model) || model.includes(entry.n))
    .sort((a, b) => b.n.length - a.n.length)[0]

  return match?.price ?? null
}

function printProviderResult(provider: Provider, rows: Array<{ device: string; scraped: number; expected: number; delta: number }>) {
  console.log(`\n${'='.repeat(68)}`)
  console.log(`${provider} - ONLINE VALIDATION`)
  console.log(`${'='.repeat(68)}`)

  if (rows.length === 0) {
    console.log('No comparable rows (likely inventory not listed online).')
    return
  }

  let mismatchCount = 0
  for (const row of rows) {
    const ok = Math.abs(row.delta) < 0.01
    if (!ok) mismatchCount += 1
    console.log(`${ok ? '✅' : '❌'} ${row.device.padEnd(34)} scraped=$${row.scraped.toFixed(2).padStart(8)} expected=$${row.expected.toFixed(2).padStart(8)} delta=${row.delta.toFixed(2)}`)
  }

  console.log(`Summary: ${rows.length - mismatchCount}/${rows.length} exact matches`)
}

async function validateCatalogBackedProvider(
  provider: Provider,
  scrapeFn: (devices: DeviceToScrape[]) => Promise<{ prices: ScrapedPrice[] }>,
  fullCatalogFn: () => Promise<{ prices: ScrapedPrice[] }>
) {
  const scraped = await scrapeFn(TEST_DEVICES)
  const catalog = await fullCatalogFn()

  const rows: Array<{ device: string; scraped: number; expected: number; delta: number }> = []

  for (const device of TEST_DEVICES) {
    const scrapedRow = scraped.prices.find((price) =>
      normalizeText(price.make) === normalizeText(device.make) &&
      normalizeText(price.model) === normalizeText(device.model) &&
      normalizeStorage(price.storage) === normalizeStorage(device.storage)
    )

    if (!scrapedRow?.trade_in_price) continue

    const catalogRows = catalog.prices.filter((price) =>
      normalizeText(price.condition || 'good') === normalizeText(device.condition || 'good')
    )

    const expectedRow = pickBestCatalogMatch(device, catalogRows)
    if (!expectedRow?.trade_in_price) continue

    rows.push({
      device: `${device.make} ${device.model} ${device.storage}`,
      scraped: scrapedRow.trade_in_price,
      expected: expectedRow.trade_in_price,
      delta: Math.round((scrapedRow.trade_in_price - expectedRow.trade_in_price) * 100) / 100,
    })
  }

  printProviderResult(provider, rows)
}

async function validateApple() {
  const scraped = await scrapeApple(TEST_DEVICES)
  const live = await extractAppleLiveEntries()

  const rows: Array<{ device: string; scraped: number; expected: number; delta: number }> = []

  for (const device of TEST_DEVICES.filter((d) => d.make.toLowerCase() === 'apple')) {
    const scrapedRow = scraped.prices.find((price) => normalizeText(price.model) === normalizeText(device.model))
    if (!scrapedRow?.trade_in_price) continue

    const appleBase = findAppleExpected(device, live)
    const expected = convertConditionPrice(appleBase, 'excellent', device.condition || 'good')
    if (!expected) continue

    rows.push({
      device: `${device.make} ${device.model} ${device.storage}`,
      scraped: scrapedRow.trade_in_price,
      expected,
      delta: Math.round((scrapedRow.trade_in_price - expected) * 100) / 100,
    })
  }

  printProviderResult('Apple Trade-In', rows)
}

async function main() {
  const providersArg = process.argv.find((arg) => arg.startsWith('--providers='))
  const requested = providersArg
    ? new Set(
      providersArg
        .split('=')[1]
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
    : null

  console.log('\n🔎 VALIDATING SCRAPED PRICES VS LIVE ONLINE SOURCES')
  console.log('Condition baseline used for this audit: good')
  console.log(`Time: ${new Date().toISOString()}\n`)

  if (!requested || requested.has('apple')) {
    await validateApple()
  }
  if (!requested || requested.has('bell')) {
    await validateCatalogBackedProvider('Bell', scrapeBell, () => scrapeBellFullCatalog(120))
  }
  if (!requested || requested.has('telus')) {
    await validateCatalogBackedProvider('Telus', scrapeTelus, scrapeTelusFullCatalog)
  }
  if (!requested || requested.has('univercell')) {
    await validateCatalogBackedProvider('UniverCell', scrapeUniversal, scrapeUniversalFullCatalog)
  }
  if (!requested || requested.has('gorecell')) {
    await validateCatalogBackedProvider('GoRecell', scrapeGoRecell, () => scrapeGoRecellFullCatalog(80))
  }

  console.log('\n✅ Validation run complete.\n')
}

main().catch((error) => {
  console.error('Validation failed:', error)
  process.exit(1)
})
