// ============================================================================
// FOREIGN EXCHANGE — Bank of Canada (official) rates for multi-currency quotes
// ============================================================================
// Amounts are stored in CAD (base currency). A quote issued in another currency
// freezes the CAD->currency multiplier on the order at quote time, so its total
// never drifts when the market moves. Source: Bank of Canada Valet API
// (FXUSDCAD = CAD per 1 USD), fetched server-side and cached for the day.
// ============================================================================

export const SUPPORTED_CURRENCIES = ['CAD', 'USD'] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export function isSupportedCurrency(c: unknown): c is Currency {
  return typeof c === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(c.toUpperCase())
}

// Both CAD and USD render with '$'; the currency code disambiguates.
export function formatMoney(amount: number, currency: string = 'CAD'): string {
  const code = (currency || 'CAD').toUpperCase()
  return `$${amount.toFixed(2)} ${code}`
}

/** Convert a CAD base amount to the order's currency using its frozen rate. */
export function convertFromCad(cadAmount: number, fxRate: number): number {
  return Math.round(cadAmount * (fxRate || 1) * 100) / 100
}

// Daily in-memory cache of the CAD->USD multiplier (per serverless instance).
let cache: { rate: number; day: string } | null = null

async function fetchUsdCad(): Promise<number | null> {
  try {
    const res = await fetch(
      'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1',
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const json = await res.json() as { observations?: Array<{ FXUSDCAD?: { v?: string } }> }
    const v = json.observations?.[0]?.FXUSDCAD?.v
    const n = v ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * CAD -> target-currency multiplier, suitable for freezing on an order.
 * CAD returns 1. USD is derived from the Bank of Canada USD/CAD rate.
 * Returns null when the rate is unavailable and nothing is cached — the caller
 * should then refuse to issue the quote in that currency rather than guess.
 */
export async function getCadToRate(currency: string): Promise<number | null> {
  const c = (currency || 'CAD').toUpperCase()
  if (c === 'CAD') return 1
  if (c !== 'USD') return null

  const today = new Date().toISOString().slice(0, 10)
  if (cache && cache.day === today) return cache.rate

  const usdcad = await fetchUsdCad()
  if (!usdcad) return cache?.rate ?? null // last-known rate if today's fetch failed

  const cadToUsd = Math.round((1 / usdcad) * 1e6) / 1e6
  cache = { rate: cadToUsd, day: today }
  return cadToUsd
}
