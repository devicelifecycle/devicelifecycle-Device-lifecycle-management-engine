// ============================================================================
// PAYMENT CUSTOMER — the one Stripe customer a tenant pays from
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getProvider } from '@/lib/payment-provider'

type Svc = ReturnType<typeof createServiceRoleClient>

export interface ChargeMethod {
  paymentMethodId: string
  providerCustomerId: string
  providerMethodId: string
}

/**
 * The card to charge for a tenant: the subscription's own payment method if
 * set and still active, else the tenant's active default card. Null when there
 * is nothing chargeable.
 *
 * Both billing crons used to select a `provider_method_id` column that does not
 * exist (the token lives in `provider_token`), so the lookup always failed and
 * every subscription was skipped as "no payment method".
 */
export async function resolveChargeMethod(
  supabase: Svc, tenantId: string, subscriptionMethodId: string | null,
): Promise<ChargeMethod | null> {
  const cols = 'id, provider_customer_id, provider_token'
  let row: Record<string, unknown> | null = null
  if (subscriptionMethodId) {
    const { data } = await supabase.from('payment_methods').select(cols)
      .eq('id', subscriptionMethodId).eq('tenant_id', tenantId).eq('is_active', true).maybeSingle()
    row = data as Record<string, unknown> | null
  }
  if (!row) {
    const { data } = await supabase.from('payment_methods').select(cols)
      .eq('tenant_id', tenantId).eq('is_active', true).eq('is_default', true).maybeSingle()
    row = data as Record<string, unknown> | null
  }
  if (!row?.provider_customer_id || !row?.provider_token) return null
  return {
    paymentMethodId: row.id as string,
    providerCustomerId: row.provider_customer_id as string,
    providerMethodId: row.provider_token as string,
  }
}

/**
 * The tenant's Stripe customer: tenants.settings.billing.providerCustomerId,
 * else one already on a saved card, else a new one. The result is persisted to
 * settings so the setup intent and the later attach share it. Never taken from
 * the client.
 */
export async function resolveProviderCustomer(supabase: Svc, tenantId: string, email: string): Promise<string> {
  const { data: tenant } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single()
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>
  const billing = (settings.billing ?? {}) as Record<string, unknown>
  if (typeof billing.providerCustomerId === 'string' && billing.providerCustomerId) return billing.providerCustomerId

  const { data: existingPm } = await supabase
    .from('payment_methods').select('provider_customer_id')
    .eq('tenant_id', tenantId).not('provider_customer_id', 'is', null).limit(1).maybeSingle()
  const id = (existingPm?.provider_customer_id as string | undefined)
    ?? (await getProvider('stripe').createCustomer({ tenantId, name: (tenant?.name as string) ?? 'Unknown', email })).providerCustomerId

  await supabase.from('tenants')
    .update({ settings: { ...settings, billing: { ...billing, providerCustomerId: id } } })
    .eq('id', tenantId)
  return id
}
