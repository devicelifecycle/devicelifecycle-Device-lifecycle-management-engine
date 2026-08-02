import { describe, it, expect } from 'vitest'
import { summarizePayments } from '@/lib/payments'

describe('invoice payment summary', () => {
  it('no records → nothing paid, full balance', () => {
    expect(summarizePayments(100, [])).toEqual({ paid: 0, refunded: 0, net: 0, balance: 100, fullyPaid: false })
  })

  it('partial payment leaves a balance', () => {
    const s = summarizePayments(100, [{ kind: 'payment', amount: 40 }])
    expect(s.paid).toBe(40); expect(s.balance).toBe(60); expect(s.fullyPaid).toBe(false)
  })

  it('paying the full total marks it fully paid', () => {
    const s = summarizePayments(100, [{ kind: 'payment', amount: 60 }, { kind: 'payment', amount: 40 }])
    expect(s.net).toBe(100); expect(s.balance).toBe(0); expect(s.fullyPaid).toBe(true)
  })

  it('a refund reduces net and re-opens the balance', () => {
    const s = summarizePayments(100, [{ kind: 'payment', amount: 100 }, { kind: 'refund', amount: 30 }])
    expect(s.paid).toBe(100); expect(s.refunded).toBe(30); expect(s.net).toBe(70); expect(s.balance).toBe(30)
    expect(s.fullyPaid).toBe(false)
  })

  it('a zero-total invoice is never "fully paid" by an empty record set', () => {
    expect(summarizePayments(0, []).fullyPaid).toBe(false)
  })
})
