// ============================================================================
// PAY A BB → VAR INVOICE WITH THE VAR'S SAVED CARD
// ============================================================================
// Concurrency: the payment_charges row (unique idempotency_key) is claimed
// BEFORE the card is charged, so two clicks at the same moment can't both
// charge — the second sees the claim and is told a payment is in progress.
// The same key is passed to Stripe, so even a retried request maps to one
// PaymentIntent. The key includes the amount already paid, so a later
// balance (after a refund) is a new, separate charge.

import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { PaymentProvider } from '@/lib/payment-provider'
import { resolveChargeMethod } from '@/lib/payment-customer'
import { summarizePayments, type PaymentRecord } from '@/lib/payments'
import { canTransitionInvoice, type InvoiceStatus } from '@/lib/billing'

type Svc = ReturnType<typeof createServiceRoleClient>

export type PayInvoiceResult =
  | { ok: true; chargeId: string; amount: number; fullyPaid: boolean }
  | { ok: false; status: number; code: string; error: string }

const round2 = (n: number) => Math.round(n * 100) / 100

export async function payInvoiceWithCard(
  supabase: Svc,
  provider: PaymentProvider,
  args: { invoiceId: string; tenantId: string; actorId: string },
): Promise<PayInvoiceResult> {
  const { invoiceId, tenantId, actorId } = args
  const { data: invoice } = await supabase
    .from('invoices').select('id, tenant_id, invoice_number, status, total, currency')
    .eq('id', invoiceId).eq('tenant_id', tenantId).maybeSingle()
  // Another tenant's invoice reads as not found.
  if (!invoice) return { ok: false, status: 404, code: 'not_found', error: 'Invoice not found.' }
  if (invoice.status !== 'sent') {
    return { ok: false, status: 400, code: 'not_payable', error: invoice.status === 'paid' ? 'This invoice is already paid.' : 'Only a sent invoice can be paid.' }
  }

  const { data: rows } = await supabase.from('invoice_payments').select('kind, amount').eq('invoice_id', invoiceId)
  const before = summarizePayments(Number(invoice.total ?? 0), (rows ?? []) as PaymentRecord[])
  const balance = round2(Number(invoice.total ?? 0) - before.net)
  if (balance <= 0) return { ok: false, status: 400, code: 'nothing_due', error: 'Nothing is outstanding on this invoice.' }

  const card = await resolveChargeMethod(supabase, tenantId, null)
  if (!card) return { ok: false, status: 400, code: 'no_card', error: 'Add a card on the Billing page first.' }

  const amountCents = Math.round(balance * 100)
  const idempotencyKey = `invoice_${invoiceId}_${Math.round(before.net * 100)}`

  // Claim this charge. A second simultaneous click hits the unique key.
  const { data: existing } = await supabase.from('payment_charges').select('status, provider_charge_id')
    .eq('idempotency_key', idempotencyKey).maybeSingle()
  if (existing?.status === 'succeeded') return { ok: false, status: 409, code: 'already_paid', error: 'This payment already went through. Refresh the page.' }
  if (existing?.status === 'pending') return { ok: false, status: 409, code: 'in_progress', error: 'A payment for this invoice is already in progress.' }
  if (existing) {
    // A previous attempt failed: clear it so this attempt can claim the key.
    await supabase.from('payment_charges').delete().eq('idempotency_key', idempotencyKey).eq('status', 'failed')
  }
  const { error: claimErr } = await supabase.from('payment_charges').insert({
    tenant_id: tenantId, payment_method_id: card.paymentMethodId, provider: 'stripe',
    amount_cents: amountCents, currency: (invoice.currency as string) ?? 'CAD', status: 'pending',
    idempotency_key: idempotencyKey, metadata: { purpose: 'invoice', invoice_id: invoiceId },
  })
  if (claimErr) {
    if ((claimErr as { code?: string }).code === '23505') {
      return { ok: false, status: 409, code: 'in_progress', error: 'A payment for this invoice is already in progress.' }
    }
    return { ok: false, status: 500, code: 'internal', error: 'Could not start the payment.' }
  }

  let result
  try {
    result = await provider.charge({
      providerCustomerId: card.providerCustomerId,
      providerMethodId: card.providerMethodId,
      amountCents,
      currency: (invoice.currency as string) ?? 'CAD',
      idempotencyKey,
      description: `Invoice ${invoice.invoice_number ?? invoiceId}`,
      // purpose=invoice tells the webhook this is NOT a subscription renewal.
      metadata: { tenant_id: tenantId, invoice_id: invoiceId, purpose: 'invoice' },
    })
  } catch (err) {
    console.error('invoice card charge errored', err)
    await supabase.from('payment_charges').update({ status: 'failed', failure_reason: 'provider_error' }).eq('idempotency_key', idempotencyKey)
    return { ok: false, status: 502, code: 'provider_error', error: 'The card processor did not respond. No payment was taken; try again.' }
  }

  if (result.status !== 'succeeded') {
    // An off-session charge needing bank confirmation won't complete on its
    // own, so it is released as failed and the VAR can retry. If the bank does
    // confirm later, the webhook still records it (see settleInvoiceFromWebhook).
    await supabase.from('payment_charges').update({
      status: 'failed',
      provider_charge_id: result.providerChargeId || null,
      failure_reason: result.failureReason ?? null,
    }).eq('idempotency_key', idempotencyKey)
    if (result.failureReason === 'requires_action') {
      return { ok: false, status: 402, code: 'requires_action', error: 'Your bank needs to confirm this payment. Re-add the card on the Billing page and try again.' }
    }
    return { ok: false, status: 402, code: 'card_declined', error: result.failureReason ? `Card declined: ${result.failureReason}` : 'The card was declined.' }
  }

  await supabase.from('payment_charges').update({ status: 'succeeded', provider_charge_id: result.providerChargeId }).eq('idempotency_key', idempotencyKey)
  const { data: rec, error: recErr } = await supabase.rpc('record_invoice_payment', {
    p_invoice_id: invoiceId, p_kind: 'payment', p_amount: balance,
    p_note: `Card payment (${result.providerChargeId})`, p_created_by: actorId,
  })
  if (recErr || !(rec as { ok?: boolean } | null)?.ok) {
    // Money moved but the ledger write failed: loud, because staff must fix it.
    console.error('CRITICAL: invoice card payment succeeded but was not recorded', { invoiceId, chargeId: result.providerChargeId, recErr, rec })
  }
  const { data: after } = await supabase.from('invoice_payments').select('kind, amount').eq('invoice_id', invoiceId)
  const summary = summarizePayments(Number(invoice.total ?? 0), (after ?? []) as PaymentRecord[])
  if (summary.fullyPaid && canTransitionInvoice(invoice.status as InvoiceStatus, 'paid')) {
    await supabase.from('invoices').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', invoiceId)
  }
  return { ok: true, chargeId: result.providerChargeId, amount: balance, fullyPaid: summary.fullyPaid }
}
