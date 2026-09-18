import { describe, it, expect } from 'vitest'
import { createSLARuleSchema, updateSLARuleSchema } from '@/lib/validations'

// The exact payload /admin/sla-rules sends (page.tsx handleCreate). This was
// a 400 for as long as the schema required a `to_status` the page never sent.
const PAGE_PAYLOAD = {
  name: 'Quote turnaround',
  description: undefined,
  from_status: 'submitted',
  order_type: null,
  warning_hours: 4,
  breach_hours: 8,
  escalation_user_ids: [],
  is_active: true,
}

describe('createSLARuleSchema', () => {
  it('accepts exactly what the admin page sends', () => {
    const r = createSLARuleSchema.safeParse(PAGE_PAYLOAD)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.order_type).toBeNull()
      expect(r.data.escalation_user_ids).toEqual([])
    }
  })

  it('accepts a typed order_type and a description', () => {
    const r = createSLARuleSchema.safeParse({ ...PAGE_PAYLOAD, order_type: 'cpo', description: 'CPO only' })
    expect(r.success).toBe(true)
  })

  it('rejects breach_hours <= warning_hours (breach would be unreachable)', () => {
    expect(createSLARuleSchema.safeParse({ ...PAGE_PAYLOAD, warning_hours: 8, breach_hours: 8 }).success).toBe(false)
    expect(createSLARuleSchema.safeParse({ ...PAGE_PAYLOAD, warning_hours: 8, breach_hours: 4 }).success).toBe(false)
  })

  it('rejects unknown statuses and order types', () => {
    expect(createSLARuleSchema.safeParse({ ...PAGE_PAYLOAD, from_status: 'nope' }).success).toBe(false)
    expect(createSLARuleSchema.safeParse({ ...PAGE_PAYLOAD, order_type: 'lease' }).success).toBe(false)
  })

  it('does not accept columns that are not on sla_rules', () => {
    const r = createSLARuleSchema.safeParse({ ...PAGE_PAYLOAD, to_status: 'quoted', applies_to_order_types: ['cpo'] })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).not.toHaveProperty('to_status')
      expect(r.data).not.toHaveProperty('applies_to_order_types')
    }
  })
})

describe('updateSLARuleSchema', () => {
  it('accepts the toggle payload the page sends', () => {
    expect(updateSLARuleSchema.safeParse({ is_active: false }).success).toBe(true)
  })
  it('lets null clear order_type (= all types) and description', () => {
    const r = updateSLARuleSchema.safeParse({ order_type: null, description: null })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.order_type).toBeNull()
      expect(r.data.description).toBeNull()
    }
  })
  it('only checks hour ordering when both hours are in the patch', () => {
    expect(updateSLARuleSchema.safeParse({ breach_hours: 2 }).success).toBe(true)
    expect(updateSLARuleSchema.safeParse({ warning_hours: 5, breach_hours: 2 }).success).toBe(false)
  })
})
