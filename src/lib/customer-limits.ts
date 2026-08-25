// ============================================================================
// CUSTOMER LIMITS -- per-customer plan override resolution (D1a)
// ============================================================================
// Resolution precedence for a customer's effective license:
//   1. Platform default (licensing.DEFAULT_LICENSE via resolveLicense)
//   2. VAR tenant plan (tenants.settings license blob -> tenantLimits())
//   3. Customer plan override (customers.plan_id -> subscription_plans row)
// This resolver implements step 3 only: given the already-resolved tenant
// license and the customer's assigned plan row (if any), it returns the
// plan's limits mapped through the same licensing.ts mapping used everywhere
// else. A null/absent plan returns the tenant license unchanged, so unset
// overrides are a strict no-op. Pure: no I/O happens in this module.

import { resolveLicense, type LicenseLimits } from './licensing'

export interface PlanRowLike {
  limits?: unknown
}

export function resolveCustomerLimits(
  tenantLicense: LicenseLimits,
  customerPlan: PlanRowLike | null,
): LicenseLimits {
  if (!customerPlan) return tenantLicense
  return resolveLicense(customerPlan.limits)
}
