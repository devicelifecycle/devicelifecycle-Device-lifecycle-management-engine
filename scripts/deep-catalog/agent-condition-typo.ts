#!/usr/bin/env npx tsx
/**
 * Deep Catalog — Condition Typo Agent
 * Validates typo normalization for condition inputs through pricing and competitor normalizers.
 */

import {
  normalizePricingConditionInput,
  normalizeCompetitorConditionInput,
} from '../../src/lib/validations'

const inputs = ['excellent', 'exacellen', 'good', 'fair', 'poor', 'brokn', 'damaged']

const pricing = Object.fromEntries(inputs.map((v) => [v, normalizePricingConditionInput(v)]))
const competitor = Object.fromEntries(inputs.map((v) => [v, normalizeCompetitorConditionInput(v)]))

console.log(JSON.stringify({ pricing, competitor }, null, 2))
