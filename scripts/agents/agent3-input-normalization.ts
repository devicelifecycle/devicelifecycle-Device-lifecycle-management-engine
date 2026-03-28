#!/usr/bin/env npx tsx
/**
 * Agent 3 — Input Normalization
 * Validate typo normalization for condition inputs (exacellen, brokn, damaged, poor)
 * through pricing and competitor normalizers. Fail if mapping is not deterministic to allowed enums.
 */

import {
  normalizePricingConditionInput,
  normalizeCompetitorConditionInput,
} from '../../src/lib/validations'

const PRICING_ENUMS = ['new', 'excellent', 'good', 'fair', 'poor'] as const
const COMPETITOR_ENUMS = ['excellent', 'good', 'fair', 'broken'] as const

const TYPO_CASES = [
  { input: 'exacellen', pricingExpected: 'excellent', competitorExpected: 'excellent' },
  { input: 'brokn', pricingExpected: 'poor', competitorExpected: 'broken' },
  { input: 'damaged', pricingExpected: 'poor', competitorExpected: 'broken' },
  { input: 'poor', pricingExpected: 'poor', competitorExpected: 'broken' },
  { input: 'excellent', pricingExpected: 'excellent', competitorExpected: 'excellent' },
  { input: 'good', pricingExpected: 'good', competitorExpected: 'good' },
  { input: 'fair', pricingExpected: 'fair', competitorExpected: 'fair' },
  { input: 'broken', pricingExpected: 'poor', competitorExpected: 'broken' },
  { input: 'exacellent', pricingExpected: 'excellent', competitorExpected: 'excellent' },
  { input: 'broke', pricingExpected: 'poor', competitorExpected: 'broken' },
  { input: 'defective', pricingExpected: 'poor', competitorExpected: 'broken' },
]

function main() {
  const failures: string[] = []
  const results: Array<{
    input: string
    pricing: string
    competitor: string
    pricingOk: boolean
    competitorOk: boolean
    inPricingEnum: boolean
    inCompetitorEnum: boolean
  }> = []

  for (const { input, pricingExpected, competitorExpected } of TYPO_CASES) {
    const pricingOut = normalizePricingConditionInput(input)
    const competitorOut = normalizeCompetitorConditionInput(input)

    const pricingOk = pricingOut === pricingExpected
    const competitorOk = competitorOut === competitorExpected
    const inPricingEnum = PRICING_ENUMS.includes(pricingOut as (typeof PRICING_ENUMS)[number])
    const inCompetitorEnum = COMPETITOR_ENUMS.includes(competitorOut as (typeof COMPETITOR_ENUMS)[number])

    if (!pricingOk) failures.push(`pricing: "${input}" -> "${pricingOut}" (expected "${pricingExpected}")`)
    if (!competitorOk) failures.push(`competitor: "${input}" -> "${competitorOut}" (expected "${competitorExpected}")`)
    if (!inPricingEnum) failures.push(`pricing: "${input}" -> "${pricingOut}" not in [${PRICING_ENUMS.join(',')}]`)
    if (!inCompetitorEnum) failures.push(`competitor: "${input}" -> "${competitorOut}" not in [${COMPETITOR_ENUMS.join(',')}]`)

    results.push({
      input,
      pricing: pricingOut,
      competitor: competitorOut,
      pricingOk,
      competitorOk,
      inPricingEnum,
      inCompetitorEnum,
    })
  }

  const pass = failures.length === 0
  const output = {
    agent: 'agent3-input-normalization',
    timestamp: new Date().toISOString(),
    pass,
    failures,
    results,
    fail_reason: pass ? undefined : failures.join('; '),
  }

  console.log(JSON.stringify(output, null, 0))
  process.exit(pass ? 0 : 1)
}

main()
