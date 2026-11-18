import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memoryDb } from '../../helpers/memory-db'
import { payInvoiceWithCard } from '@/lib/invoice-card-payment'

let db: ReturnType<typeof memoryDb>
const charge = vi.fn()
const provider = { charge } as never

function seed(over: { status?: string; payments?: { kind: string; amount: number }[]; card?: boolean } = {}) {
  db = memoryDb({
    invoices: [{ id: 'inv-1', tenant_id: 'var-1', invoice_number: 'INV-2026-0009', status: over.status ?? 'sent', total: 113, currency: 'CAD' }],
    invoice_payments: (over.payments ?? []).map((p) => ({ invoice_id: 'inv-1', ...p })),
    payment_methods: over.card === false ? [] : [{ id: 'pm-row', tenant_id: 'var-1', provider_token: 'pm_visa', provider_customer_id: 'cus_1', is_default: true, is_active: true }],
    payment_charges: [],
  })
  // record_invoice_payment RPC stand-in: append the payment row
  ;(db as unknown as { rpc: unknown }).rpc = async (_: string, a: { p_invoice_id: string; p_kind: string; p_amount: number }) => {
    db.tables.invoice_payments.push({ invoice_id: a.p_invoice_id, kind: a.p_kind, amount: a.p_amount })
    return { data: { ok: true }, error: null }
  }
}
const pay = () => payInvoiceWithCard(db as never, provider, { invoiceId: 'inv-1', tenantId: 'var-1', actorId: 'u1' })

beforeEach(() => { charge.mockReset(); charge.mockResolvedValue({ providerChargeId: 'pi_1', status: 'succeeded' }) })

describe('payInvoiceWithCard', () => {
  it('charges the outstanding balance, records it and marks the invoice paid', async () => {
    seed({ payments: [{ kind: 'payment', amount: 13 }] })
    const r = await pay()
    expect(r).toMatchObject({ ok: true, amount: 100, fullyPaid: true })
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10000, providerMethodId: 'pm_visa', idempotencyKey: 'invoice_inv-1_1300', metadata: expect.objectContaining({ purpose: 'invoice' }) }))
    expect(db.tables.invoices[0].status).toBe('paid')
    expect(db.tables.payment_charges[0]).toMatchObject({ status: 'succeeded', provider_charge_id: 'pi_1' })
  })

  it("another tenant's invoice reads as not found and is never charged", async () => {
    seed()
    const r = await payInvoiceWithCard(db as never, provider, { invoiceId: 'inv-1', tenantId: 'var-2', actorId: 'u1' })
    expect(r).toMatchObject({ ok: false, code: 'not_found' })
    expect(charge).not.toHaveBeenCalled()
  })

  it('refuses drafts, paid invoices, nothing due, and no card — without charging', async () => {
    seed({ status: 'draft' }); expect(await pay()).toMatchObject({ code: 'not_payable' })
    seed({ status: 'paid' }); expect(await pay()).toMatchObject({ code: 'not_payable' })
    seed({ payments: [{ kind: 'payment', amount: 113 }] }); expect(await pay()).toMatchObject({ code: 'nothing_due' })
    seed({ card: false }); expect(await pay()).toMatchObject({ code: 'no_card' })
    expect(charge).not.toHaveBeenCalled()
  })

  it('a second click while the first is in flight cannot charge twice', async () => {
    seed()
    db.tables.payment_charges.push({ idempotency_key: 'invoice_inv-1_0', status: 'pending' })
    expect(await pay()).toMatchObject({ ok: false, code: 'in_progress' })
    expect(charge).not.toHaveBeenCalled()
  })

  it('declined card: nothing recorded on the invoice, and a retry is allowed', async () => {
    seed()
    charge.mockResolvedValueOnce({ providerChargeId: 'pi_2', status: 'failed', failureReason: 'Your card has insufficient funds.' })
    expect(await pay()).toMatchObject({ ok: false, code: 'card_declined' })
    expect(db.tables.invoice_payments).toHaveLength(0)
    expect(db.tables.invoices[0].status).toBe('sent')
    expect(await pay()).toMatchObject({ ok: true })
  })

  it('processor error: no payment recorded, claim released', async () => {
    seed()
    charge.mockRejectedValueOnce(new Error('ECONNRESET'))
    expect(await pay()).toMatchObject({ ok: false, code: 'provider_error' })
    expect(db.tables.payment_charges[0].status).toBe('failed')
    expect(db.tables.invoice_payments).toHaveLength(0)
  })
})
