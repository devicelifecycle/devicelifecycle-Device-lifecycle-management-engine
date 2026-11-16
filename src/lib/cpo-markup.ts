export const DEFAULT_CPO_MARKUP_PERCENT = 18

/**
 * The CPO markup actually applied, from a stored/entered "percent" value.
 *
 * Values below 1 are treated as unset, the same rule the admin pricing page
 * uses when it displays the setting. Legacy rows stored the markup as a
 * fraction (e.g. "0.01"), which read as a percent quoted customers at ~cost.
 */
export function effectiveCpoMarkupPercent(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_CPO_MARKUP_PERCENT
}
