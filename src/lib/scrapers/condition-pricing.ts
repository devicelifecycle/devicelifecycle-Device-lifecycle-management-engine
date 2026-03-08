import type { ScrapedPrice } from './types'

export type ScraperCondition = NonNullable<ScrapedPrice['condition']>

const CONDITION_MULTIPLIERS: Record<ScraperCondition, number> = {
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  broken: 0.50,
}

export const SCRAPER_CONDITIONS: ScraperCondition[] = ['excellent', 'good', 'fair', 'broken']

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

export function convertConditionPrice(
  basePrice: number | null,
  fromCondition: ScraperCondition,
  toCondition: ScraperCondition
): number | null {
  if (basePrice == null || !Number.isFinite(basePrice) || basePrice <= 0) return null
  const fromMultiplier = CONDITION_MULTIPLIERS[fromCondition]
  const toMultiplier = CONDITION_MULTIPLIERS[toCondition]
  const converted = (basePrice / fromMultiplier) * toMultiplier
  return roundCurrency(converted)
}

export function expandPriceByConditions(
  base: Omit<ScrapedPrice, 'condition' | 'trade_in_price'>,
  basePrice: number | null,
  baseCondition: ScraperCondition,
  rawBuilder?: (condition: ScraperCondition) => unknown
): ScrapedPrice[] {
  return SCRAPER_CONDITIONS.map((condition) => ({
    ...base,
    condition,
    trade_in_price: convertConditionPrice(basePrice, baseCondition, condition),
    raw: rawBuilder ? rawBuilder(condition) : base.raw,
  }))
}
