// ============================================================================
// VAR PAYMENT METHODS API — manage tokenized payment methods
// ============================================================================
// Card data never touches our servers. The client collects card details
// through Stripe's hosted fields (Elements), which returns a PaymentMethod
// token. That token is all we store.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { hasProvider, getProvider } from '@/lib/payment-provider'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const VAR_ADMIN_ROLES = ['var_entity_admin', 'admin']

const attachSchema = z.object({
  provider_method_id: z.string().min(1),
  set_default: z.boolean().optional().default(true),
})

const setupIntentSchema = z.object({
  provider_customer_id: z.string().min(1),
})

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, provider, brand, last4, exp_month, exp_year, is_default, is_active, created_at')
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load payment methods' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!VAR_ADMIN_ROLES.includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Only administrators can manage payment methods' }, { status: 403 })
  }
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  if (!hasProvider('stripe')) {
    return NextResponse.json({ error: 'Payment processing is not configured yet. Contact support.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  // Create a SetupIntent for the client to use with Stripe Elements
  if (action === 'setup-intent') {
    const parsed = setupIntentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }

    // Verify the Stripe customer belongs to this tenant — prevents IDOR
    const supabaseCheck = createServiceRoleClient()
    const { data: owned } = await supabaseCheck
      .from('payment_methods')
      .select('id')
      .eq('tenant_id', auth.tenantId)
      .eq('provider_customer_id', parsed.data.provider_customer_id)
      .limit(1)
      .maybeSingle()

    if (!owned) {
      return NextResponse.json({ error: 'Invalid customer reference' }, { status: 403 })
    }

    try {
      const provider = getProvider('stripe')
      const result = await provider.createSetupIntent({
        providerCustomerId: parsed.data.provider_customer_id,
      })
      return NextResponse.json({ data: result })
    } catch (err) {
      console.error('Failed to create setup intent:', err)
      return NextResponse.json({ error: 'Failed to initialize card setup' }, { status: 500 })
    }
  }

  // Attach a tokenized payment method
  const parsed = attachSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  try {
    // Get or create the Stripe customer for this tenant
    let providerCustomerId: string

    const { data: existingPm } = await supabase
      .from('payment_methods')
      .select('provider_customer_id')
      .eq('tenant_id', auth.tenantId)
      .not('provider_customer_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (existingPm?.provider_customer_id) {
      providerCustomerId = existingPm.provider_customer_id
    } else {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', auth.tenantId)
        .single()

      const provider = getProvider('stripe')
      const { providerCustomerId: newId } = await provider.createCustomer({
        tenantId: auth.tenantId,
        name: tenant?.name ?? 'Unknown',
        email: auth.authUser.email ?? '',
      })
      providerCustomerId = newId
    }

    // Attach the payment method via Stripe
    const provider = getProvider('stripe')
    const attached = await provider.attachPaymentMethod({
      providerCustomerId,
      providerMethodId: parsed.data.provider_method_id,
    })

    // If setting as default, unset any existing defaults
    if (parsed.data.set_default) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('tenant_id', auth.tenantId)
        .eq('is_default', true)
    }

    // Store the tokenized reference
    const { data: pm, error } = await supabase
      .from('payment_methods')
      .insert({
        tenant_id: auth.tenantId,
        provider: 'stripe',
        provider_token: attached.providerMethodId,
        provider_customer_id: providerCustomerId,
        brand: attached.brand,
        last4: attached.last4,
        exp_month: attached.expMonth,
        exp_year: attached.expYear,
        is_default: parsed.data.set_default,
      })
      .select('id, provider, brand, last4, exp_month, exp_year, is_default, is_active, created_at')
      .single()

    if (error) throw error
    return NextResponse.json({ data: pm }, { status: 201 })
  } catch (err) {
    console.error('Failed to attach payment method:', err)
    return NextResponse.json({ error: 'Failed to add payment method' }, { status: 500 })
  }
}
