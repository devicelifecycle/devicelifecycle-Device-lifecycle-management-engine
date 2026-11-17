// ============================================================================
// PAYMENT CUSTOMER — the one Stripe customer a tenant pays from
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getProvider } from '@/lib/payment-provider'

type Svc = ReturnType<typeof createServiceRoleClient>

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
