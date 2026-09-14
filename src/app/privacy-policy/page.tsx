// ============================================================================
// PRIVACY POLICY — tenant's own policy when it has one, else the platform's
// ============================================================================
// A VAR can publish its own privacy policy URL (settings.whitelabel.
// privacyPolicyUrl, edited on the admin tenant page). That field was editable
// and stored but read by nothing, so every VAR's customers were shown
// Byte-Back's generic policy — a white-label leak in the same family as the
// email/PDF branding gaps. When the tenant has a URL we send the visitor
// there; otherwise the platform policy renders unchanged.

import { redirect } from 'next/navigation'
import { getServerTenant } from '@/lib/tenant-context'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveTenantWhiteLabel } from '@/lib/templates'
import PrivacyPolicyContent from './_client'

export const dynamic = 'force-dynamic'

export default async function PrivacyPolicyPage() {
  const tenant = await getServerTenant()
  if (!tenant.isPlatform) {
    // resolveTenantWhiteLabel only ever returns an http(s) URL (cleanUrl in
    // templates.ts) or null, so this can't be turned into a javascript: or
    // relative-path redirect by a stored value.
    const { privacyPolicyUrl } = await resolveTenantWhiteLabel(tenant.tenantId, createServiceRoleClient())
    if (privacyPolicyUrl) redirect(privacyPolicyUrl)
  }
  return <PrivacyPolicyContent />
}
