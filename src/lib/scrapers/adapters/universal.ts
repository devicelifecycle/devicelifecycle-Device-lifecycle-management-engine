// ============================================================================
// UNIVERSAL TRADE-IN SCRAPER
// ============================================================================

import cheerio from 'cheerio'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice, throttle } from '../utils'
import { convertConditionPrice, expandPriceByConditions } from '../condition-pricing'

const PRIMARY_TRADE_IN_URL = process.env.UNIVERSAL_TRADE_IN_URL || 'https://univercell.ai/'
const FALLBACK_TRADE_IN_URL = process.env.UNIVERSAL_TRADE_IN_FALLBACK_URL || 'https://www.universalcell.ca/'
const UNIVERCELL_ACTION_URL = process.env.UNIVERCELL_ACTION_URL || 'https://univercell.ai/sell/details/mobile'
const ACTION_GET_DEVICE_TYPES = process.env.UNIVERCELL_ACTION_GET_DEVICE_TYPES || '00c319d19deb1a3ea5c58d00ca9a738fdc68155ace'
const ACTION_GET_MAKES_FOR_DEVICE_TYPE = process.env.UNIVERCELL_ACTION_GET_MAKES_FOR_DEVICE_TYPE || '406241e7d44a86cb31a7ef7b980db7f7c9e7d013fc'
const ACTION_GET_MODELS_FOR_MAKE_AND_TYPE = process.env.UNIVERCELL_ACTION_GET_MODELS_FOR_MAKE_AND_TYPE || '6034ef606d7e2c9f1141128efc8cf4695e403bd4ee'

type $Root = ReturnType<typeof cheerio.load>
type UniverCellDeviceType = {
  id: string
  name: string
  rd_id?: number
}
type UniverCellMake = {
  id: string
  name: string
  rb_id?: number
}
type UniverCellModel = {
  id: string
  name: string
  sydCapacityPrices?: Array<{
    capacity?: string
    flawlessPrice?: string
  }>
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeStorage(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function parseActionArray<T>(text: string): T[] | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const payload = line.slice(separator + 1)
    if (!payload.startsWith('[')) continue
    try {
      const parsed = JSON.parse(payload)
      if (Array.isArray(parsed)) return parsed as T[]
    } catch {
      continue
    }
  }

  return null
}

async function fetchUniverCellAction<T>(actionId: string, args: unknown[]): Promise<T[] | null> {
  const response = await fetchWithRetry(UNIVERCELL_ACTION_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionId,
    },
    body: JSON.stringify(args),
  })

  if (!response.ok) return null
  const body = await response.text()
  return parseActionArray<T>(body)
}

function inferTypeIdForDevice(device: DeviceToScrape): string {
  const model = normalizeText(device.model)
  if (model.includes('watch')) return 'smart-watch'
  if (model.includes('ipad') || model.includes('tablet')) return 'ipad-tablet'
  if (model.includes('macbook') || model.includes('laptop') || model.includes('pc')) return 'pc-macbook-laptop'
  if (model.includes('playstation') || model.includes('xbox') || model.includes('nintendo')) return 'gaming-console'
  return 'mobile'
}

function selectBestModel(device: DeviceToScrape, models: UniverCellModel[]): { model: UniverCellModel; price: number } | null {
  const modelToken = normalizeText(device.model)
  const storageToken = normalizeStorage(device.storage)

  const candidates = models
    .map((model) => {
      const name = normalizeText(model.name || '')
      const capacityList = Array.isArray(model.sydCapacityPrices)
        ? model.sydCapacityPrices
        : (model.sydCapacityPrices && typeof model.sydCapacityPrices === 'object'
            ? Object.values(model.sydCapacityPrices as Record<string, { capacity?: string; flawlessPrice?: string }>)
            : [])

      const prices = capacityList
        .map((entry) => {
          const price = Number(entry.flawlessPrice)
          if (!Number.isFinite(price) || price <= 0) return null
          const capacity = normalizeStorage(entry.capacity || '')
          return { price, capacity }
        })
        .filter((entry): entry is { price: number; capacity: string } => entry !== null)

      if (!modelToken || !name.includes(modelToken) || prices.length === 0) return null

      const storageMatched = prices.find((entry) => storageToken && entry.capacity.includes(storageToken))
      const picked = storageMatched || prices[0]

      let score = 0
      if (name === modelToken) score += 12
      if (name.includes(modelToken)) score += 6
      if (storageMatched) score += 4

      return {
        model,
        price: picked.price,
        score,
      }
    })
    .filter((entry): entry is { model: UniverCellModel; price: number; score: number } => entry !== null)
    .sort((left, right) => right.score - left.score)

  const best = candidates[0]
  return best ? { model: best.model, price: best.price } : null
}

function getUniverCellCapacityEntries(model: UniverCellModel): Array<{ capacity: string; flawlessPrice: number }> {
  const capacityList = Array.isArray(model.sydCapacityPrices)
    ? model.sydCapacityPrices
    : (model.sydCapacityPrices && typeof model.sydCapacityPrices === 'object'
        ? Object.values(model.sydCapacityPrices as Record<string, { capacity?: string; flawlessPrice?: string }>)
        : [])

  return capacityList
    .map((entry) => {
      const price = Number(entry.flawlessPrice)
      if (!Number.isFinite(price) || price <= 0) return null
      return {
        capacity: (entry.capacity || 'Unknown').trim() || 'Unknown',
        flawlessPrice: price,
      }
    })
    .filter((entry): entry is { capacity: string; flawlessPrice: number } => entry !== null)
}

function dedupeUniverCellCatalogPrices(prices: ScrapedPrice[]): ScrapedPrice[] {
  const map = new Map<string, ScrapedPrice>()
  for (const price of prices) {
    const key = `${price.make.toLowerCase()}|${price.model.toLowerCase()}|${price.storage.toLowerCase()}|${(price.condition || 'good').toLowerCase()}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, price)
      continue
    }

    if ((price.trade_in_price ?? -1) > (existing.trade_in_price ?? -1)) {
      map.set(key, price)
    }
  }
  return Array.from(map.values())
}

export async function scrapeUniversal(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    let matchedViaActions = 0

    const typePayload = await fetchUniverCellAction<UniverCellDeviceType>(ACTION_GET_DEVICE_TYPES, [])
    const deviceTypes = typePayload || []

    const neededTypeIds = Array.from(new Set(devices.map((device) => inferTypeIdForDevice(device))))
    const typeMap = new Map(deviceTypes.map((type) => [type.id, type]))

    const makesByType = new Map<string, UniverCellMake[]>()
    for (const typeId of neededTypeIds) {
      const makes = await fetchUniverCellAction<UniverCellMake>(ACTION_GET_MAKES_FOR_DEVICE_TYPE, [typeId])
      makesByType.set(typeId, makes || [])
      await throttle(120)
    }

    const modelsByTypeMake = new Map<string, UniverCellModel[]>()
    const makeFetchKeys = new Set<string>()
    for (const device of devices) {
      const typeId = inferTypeIdForDevice(device)
      const makeToken = normalizeText(device.make)
      const matchedMake = (makesByType.get(typeId) || []).find((make) => normalizeText(make.name).includes(makeToken))
      const type = typeMap.get(typeId)
      if (!matchedMake || !type?.rd_id || !matchedMake.rb_id) continue
      makeFetchKeys.add(`${type.rd_id}:${matchedMake.rb_id}`)
    }

    for (const key of Array.from(makeFetchKeys)) {
      const [rdIdRaw, rbIdRaw] = key.split(':')
      const rdId = Number(rdIdRaw)
      const rbId = Number(rbIdRaw)
      if (!Number.isFinite(rdId) || !Number.isFinite(rbId)) continue
      const models = await fetchUniverCellAction<UniverCellModel>(ACTION_GET_MODELS_FOR_MAKE_AND_TYPE, [rbId, rdId])
      modelsByTypeMake.set(key, models || [])
      await throttle(120)
    }

    if (deviceTypes.length > 0) {
      for (const device of devices) {
        const typeId = inferTypeIdForDevice(device)
        const makeToken = normalizeText(device.make)
        const type = typeMap.get(typeId)
        const matchedMake = (makesByType.get(typeId) || []).find((make) => normalizeText(make.name).includes(makeToken))

        let matchedPrice: number | null = null
        if (type?.rd_id && matchedMake?.rb_id) {
          const models = modelsByTypeMake.get(`${type.rd_id}:${matchedMake.rb_id}`) || []
          const best = selectBestModel(device, models)
          if (best) {
            matchedPrice = best.price
            matchedViaActions += 1
          }
        }

        const requestedCondition = device.condition ?? 'good'
        const adjustedTradePrice = convertConditionPrice(matchedPrice, 'excellent', requestedCondition)

        prices.push({
          competitor_name: 'UniverCell',
          make: device.make,
          model: device.model,
          storage: device.storage,
          trade_in_price: adjustedTradePrice,
          sell_price: null,
          condition: requestedCondition,
          scraped_at: now,
          raw: { matched: matchedPrice != null, source: 'univercell-actions' },
        })
        await throttle(220)
      }
    }

    if (matchedViaActions > 0) {
      return {
        competitor_name: 'UniverCell',
        prices,
        success: true,
        duration_ms: Date.now() - start,
      }
    }

    const candidateUrls = Array.from(new Set([PRIMARY_TRADE_IN_URL, FALLBACK_TRADE_IN_URL]))
    let html = ''
    let activeUrl = candidateUrls[0]

    for (const url of candidateUrls) {
      try {
        const res = await fetchWithRetry(url, { method: 'GET' })
        if (!res.ok) continue
        html = await res.text()
        activeUrl = url
        break
      } catch {
        continue
      }
    }

    if (!html) {
      throw new Error('Unable to fetch UniverCell prices from configured URLs')
    }

    const $ = cheerio.load(html)
    const domPrices = extractDomPrices($)

    for (const device of devices) {
      const makeToken = normalizeText(device.make || '')
      const modelToken = normalizeText(device.model || '')
      const storageToken = normalizeStorage(device.storage || '')

      const match = domPrices.find(item => {
        const contextText = normalizeText(item.context)
        const contextStorage = normalizeStorage(item.context)

        const hasMake = !makeToken || contextText.includes(makeToken)
        const hasModel = modelToken.length > 0 && contextText.includes(modelToken)
        const hasStorage = !storageToken || contextStorage.includes(storageToken)

        return hasMake && hasModel && hasStorage
      })

      const requestedCondition = device.condition ?? 'good'
      const adjustedTradePrice = convertConditionPrice(match?.price ?? null, 'good', requestedCondition)

      prices.push({
        competitor_name: 'UniverCell',
        make: device.make,
        model: device.model,
        storage: device.storage,
        trade_in_price: adjustedTradePrice,
        sell_price: null,
        condition: requestedCondition,
        scraped_at: now,
        raw: { matched: !!match, source: activeUrl },
      })

      await throttle(250)
    }

    const matchedCount = prices.filter((price) => price.trade_in_price != null).length
    const success = matchedCount > 0

    return {
      competitor_name: 'UniverCell',
      prices,
      success,
      error: success ? undefined : 'No UniverCell trade-in prices matched current parser',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'UniverCell',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}

export async function scrapeUniversalFullCatalog(): Promise<ScraperResult> {
  const start = Date.now()
  const now = new Date().toISOString()

  try {
    const types = await fetchUniverCellAction<UniverCellDeviceType>(ACTION_GET_DEVICE_TYPES, [])
    if (!types || types.length === 0) {
      return {
        competitor_name: 'UniverCell',
        prices: [],
        success: false,
        error: 'UniverCell device types unavailable',
        duration_ms: Date.now() - start,
      }
    }

    const collected: ScrapedPrice[] = []

    for (const type of types) {
      if (!type.id || !type.rd_id) continue

      const makes = await fetchUniverCellAction<UniverCellMake>(ACTION_GET_MAKES_FOR_DEVICE_TYPE, [type.id])
      if (!makes || makes.length === 0) {
        await throttle(120)
        continue
      }

      for (const make of makes) {
        if (!make.rb_id) continue

        const models = await fetchUniverCellAction<UniverCellModel>(ACTION_GET_MODELS_FOR_MAKE_AND_TYPE, [make.rb_id, type.rd_id])
        if (!models || models.length === 0) {
          await throttle(120)
          continue
        }

        for (const model of models) {
          const capacities = getUniverCellCapacityEntries(model)
          for (const entry of capacities) {
            collected.push(
              ...expandPriceByConditions(
                {
                  competitor_name: 'UniverCell',
                  make: make.name || 'Other',
                  model: model.name || 'Unknown',
                  storage: entry.capacity,
                  sell_price: null,
                  scraped_at: now,
                },
                entry.flawlessPrice,
                'excellent',
                (condition) => ({
                  source: 'univercell-actions-discovery',
                  typeId: type.id,
                  makeId: make.id,
                  modelId: model.id,
                  base_condition: 'excellent',
                  condition,
                })
              )
            )
          }
        }
        await throttle(120)
      }
      await throttle(120)
    }

    const prices = dedupeUniverCellCatalogPrices(collected)
    return {
      competitor_name: 'UniverCell',
      prices,
      success: prices.length > 0,
      error: prices.length > 0 ? undefined : 'No UniverCell catalog prices discovered',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'UniverCell',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}

function extractDomPrices($: $Root): Array<{ price: number; context: string }> {
  const results: Array<{ price: number; context: string }> = []
  const selectors = [
    '[data-price]',
    '.price',
    '.trade-in-value',
    '.trade-value',
    '.device-price',
    '.amount',
  ]

  for (const selector of selectors) {
    $(selector).each(function (this: any) {
      const $el = $(this)
      const text = $el.text().trim()
      const dataPrice = $el.attr('data-price') || ''
      const price = parsePrice(dataPrice) || parsePrice(text)
      if (price != null && price >= 5 && price <= 6000) {
        const context = $el.parent().text().trim().slice(0, 160)
        results.push({ price, context })
      }
    })
  }

  return results
}
