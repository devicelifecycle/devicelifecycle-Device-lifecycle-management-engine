// ============================================================================
// SALES TAX — jurisdiction resolution for CPO invoices
// ============================================================================
// Canada: accurate combined GST / HST / PST / QST by province (2026).
// US:     STATE-LEVEL BASE RATE ONLY — a placeholder. Real US sales tax is
//         state + county + city and needs a tax provider (TaxJar/Avalara);
//         resolveTaxRate flags US results with isPlaceholder = true.
//
// Tax applies to CPO (customer-purchase) invoices, not trade-in payouts.
// ============================================================================

export interface TaxResult {
  /** Combined rate as a fraction, e.g. 0.13 for 13%. 0 when unresolvable. */
  rate: number
  /** Human label for the invoice line, e.g. "HST (ON)" or "Sales Tax (CA)". */
  label: string
  /** Resolved jurisdiction code, e.g. "ON" / "CA-US". Empty when unresolved. */
  jurisdiction: string
  /** True for US (state-base-rate only) — the invoice notes it's an estimate. */
  isPlaceholder: boolean
}

// Canadian combined sales-tax rates by province/territory (2026).
const CA_RATES: Record<string, { rate: number; label: string }> = {
  AB: { rate: 0.05,    label: 'GST' },
  BC: { rate: 0.12,    label: 'GST+PST' },
  MB: { rate: 0.12,    label: 'GST+RST' },
  NB: { rate: 0.15,    label: 'HST' },
  NL: { rate: 0.15,    label: 'HST' },
  NS: { rate: 0.14,    label: 'HST' }, // reduced to 14% on 2025-04-01
  NT: { rate: 0.05,    label: 'GST' },
  NU: { rate: 0.05,    label: 'GST' },
  ON: { rate: 0.13,    label: 'HST' },
  PE: { rate: 0.15,    label: 'HST' },
  QC: { rate: 0.14975, label: 'GST+QST' },
  SK: { rate: 0.11,    label: 'GST+PST' },
  YT: { rate: 0.05,    label: 'GST' },
}

const CA_NAME_TO_CODE: Record<string, string> = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', newfoundland: 'NL', labrador: 'NL',
  'nova scotia': 'NS', 'northwest territories': 'NT', nunavut: 'NU',
  ontario: 'ON', 'prince edward island': 'PE', quebec: 'QC', 'québec': 'QC',
  saskatchewan: 'SK', yukon: 'YT',
}

// US state base sales-tax rates (state level only — PLACEHOLDER).
const US_RATES: Record<string, number> = {
  AL: 0.04, AK: 0, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029, CT: 0.0635,
  DE: 0, DC: 0.06, FL: 0.06, GA: 0.04, HI: 0.04, ID: 0.06, IL: 0.0625,
  IN: 0.07, IA: 0.06, KS: 0.065, KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06,
  MA: 0.0625, MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225, MT: 0, NE: 0.055,
  NV: 0.0685, NH: 0, NJ: 0.06625, NM: 0.04875, NY: 0.04, NC: 0.0475, ND: 0.05,
  OH: 0.0575, OK: 0.045, OR: 0, PA: 0.06, RI: 0.07, SC: 0.06, SD: 0.042,
  TN: 0.07, TX: 0.0625, UT: 0.061, VT: 0.06, VA: 0.053, WA: 0.065, WV: 0.06,
  WI: 0.05, WY: 0.04,
}

const US_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
}

const US_COUNTRY = new Set(['us', 'usa', 'united states', 'united states of america', 'u.s.', 'u.s.a.'])

function norm(v?: string | null): string {
  return (v ?? '').toString().trim().toLowerCase()
}

/**
 * Resolve the sales-tax rate for a billing region.
 * Country defaults to Canada (the operating jurisdiction) when unspecified.
 * Returns rate 0 when the jurisdiction can't be resolved — callers should then
 * omit the tax line rather than guess.
 */
export function resolveTaxRate(region?: string | null, country?: string | null): TaxResult {
  const r = norm(region)
  const c = norm(country)
  const empty: TaxResult = { rate: 0, label: 'Tax', jurisdiction: '', isPlaceholder: false }
  if (!r) return empty

  const isUS = US_COUNTRY.has(c)
  if (isUS) {
    const code = r.length === 2 ? r.toUpperCase() : US_NAME_TO_CODE[r]
    if (code && code in US_RATES) {
      return { rate: US_RATES[code], label: `Sales Tax (${code})`, jurisdiction: `${code}-US`, isPlaceholder: true }
    }
    return empty
  }

  // Default to Canada when country is blank or Canadian.
  const code = r.length === 2 ? r.toUpperCase() : CA_NAME_TO_CODE[r]
  if (code && code in CA_RATES) {
    const { rate, label } = CA_RATES[code]
    return { rate, label: `${label} (${code})`, jurisdiction: code, isPlaceholder: false }
  }
  return empty
}

/** Round a tax amount to cents. */
export function computeTax(subtotal: number, rate: number): number {
  return Math.round(subtotal * rate * 100) / 100
}

/** Format a rate as a percent string: whole numbers plain, else 3 decimals (QST). */
export function formatTaxPercent(rate: number): string {
  const pct = rate * 100
  return (pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(3)) + '%'
}

export interface OrderTaxLine {
  subtotal: number
  rate: number
  taxAmount: number
  /** e.g. "HST (ON) 13%" or "Sales Tax (CA) 7.25% (est.)" */
  label: string
  total: number
}

/**
 * Single source of truth for a taxable order's tax line — used by the PDF,
 * Excel, and email so the three documents never disagree. Returns null when the
 * order isn't taxable (not CPO), has no subtotal, or the jurisdiction can't be
 * resolved from the billing address (caller then shows no tax line).
 */
export function computeOrderTaxLine(params: {
  type?: string
  subtotal?: number | null
  billingAddress?: string | Record<string, unknown> | null
}): OrderTaxLine | null {
  const subtotal = params.subtotal ?? 0
  if (params.type !== 'cpo' || subtotal <= 0) return null
  const addr = params.billingAddress
  const region = addr && typeof addr === 'object' ? String((addr as Record<string, unknown>).state ?? (addr as Record<string, unknown>).province ?? '') : ''
  const country = addr && typeof addr === 'object' ? String((addr as Record<string, unknown>).country ?? '') : ''
  const tax = resolveTaxRate(region, country)
  if (tax.rate <= 0) return null
  const taxAmount = computeTax(subtotal, tax.rate)
  return {
    subtotal,
    rate: tax.rate,
    taxAmount,
    label: `${tax.label} ${formatTaxPercent(tax.rate)}${tax.isPlaceholder ? ' (est.)' : ''}`,
    total: subtotal + taxAmount,
  }
}
