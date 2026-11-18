// ============================================================================
// POST /api/var/billing/{id}/pay — the VAR pays a sent BB invoice by card
// ============================================================================
// Charges the VAR's saved default card for the invoice's outstanding balance
// and records the payment against the invoice (marked paid when settled).
// VAR entity admin only. See src/lib/invoice-card-payment.ts for the
// double-charge protection.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized, refuseWhileImpersonating } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { hasProvider, getProvider } from '@/lib/payment-provider'
import { initStripeProvider } from '@/lib/payment-providers/stripe'
import { payInvoiceWithCard } from '@/lib/invoice-card-payment'
import { checkRateLimitAsync, RATE_LIMITS } from '@/lib/rate-limit'
import { isValidUUID } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const impBlocked = refuseWhileImpersonating(auth)
  if (impBlocked) return impBlocked
  if (auth.effectiveRole !== 'var_entity_admin') {
    return NextResponse.json({ error: 'Only your organization administrator can pay invoices.' }, { status: 403 })
  }
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant in scope' }, { status: 400 })
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 })

  const rl = await checkRateLimitAsync(`invoice-pay:${auth.profile.id}`, RATE_LIMITS.api)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  initStripeProvider()
  if (!hasProvider('stripe')) {
    return NextResponse.json({ error: 'Card payments are not set up yet. Pay by bank transfer, or contact support.', code: 'not_configured' }, { status: 503 })
  }

  const r = await payInvoiceWithCard(createServiceRoleClient(), getProvider('stripe'), {
    invoiceId: id, tenantId: auth.tenantId, actorId: auth.profile.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status })
  return NextResponse.json({ data: { amount: r.amount, chargeId: r.chargeId, fullyPaid: r.fullyPaid } })
}
