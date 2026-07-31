// ============================================================================
// PERMISSION MATRIX
// ============================================================================
// Canonical encoding of the outline's "Recommended Permission Matrix" (Function
// x role x scope). This is the reference the three consoles gate against; the
// scope tells you HOW MUCH of a function a level can reach (global vs. own tenant
// vs. own company), not just yes/no.

export type MatrixRole = 'platform_admin' | 'var_admin' | 'customer_admin'

export type Access =
  | 'none'
  | 'full'          // unrestricted
  | 'global'        // across the whole platform
  | 'tenant'        // scoped to own VAR tenant
  | 'company'       // scoped to own customer company
  | 'own'           // own records only
  | 'own_customers' // a VAR's own customers
  | 'assign'        // may allocate but not define
  | 'view'          // read-only
  | 'limited'       // constrained subset
  | 'optional'      // available if enabled

export type MatrixFunction =
  | 'platform_settings' | 'manage_vars' | 'white_label_branding'
  | 'manage_customers' | 'manage_customer_users' | 'view_billing'
  | 'create_invoices' | 'reporting' | 'api_keys' | 'audit_logs'
  | 'support_tickets' | 'mfa_policies' | 'feature_enablement'
  | 'storage_limits' | 'licensing' | 'impersonate_users' | 'delete_data'

// Rows transcribed directly from the document's matrix.
export const PERMISSION_MATRIX: Record<MatrixFunction, Record<MatrixRole, Access>> = {
  platform_settings:     { platform_admin: 'full',   var_admin: 'none',          customer_admin: 'none' },
  manage_vars:           { platform_admin: 'full',   var_admin: 'none',          customer_admin: 'none' },
  white_label_branding:  { platform_admin: 'full',   var_admin: 'own',           customer_admin: 'none' },
  manage_customers:      { platform_admin: 'full',   var_admin: 'own',           customer_admin: 'none' },
  manage_customer_users: { platform_admin: 'full',   var_admin: 'own_customers', customer_admin: 'company' },
  view_billing:          { platform_admin: 'full',   var_admin: 'tenant',        customer_admin: 'own' },
  create_invoices:       { platform_admin: 'full',   var_admin: 'optional',      customer_admin: 'none' },
  reporting:             { platform_admin: 'global', var_admin: 'tenant',        customer_admin: 'company' },
  api_keys:              { platform_admin: 'global', var_admin: 'tenant',        customer_admin: 'company' },
  audit_logs:            { platform_admin: 'global', var_admin: 'tenant',        customer_admin: 'company' },
  support_tickets:       { platform_admin: 'full',   var_admin: 'own',           customer_admin: 'own' },
  mfa_policies:          { platform_admin: 'global', var_admin: 'limited',       customer_admin: 'own' },
  feature_enablement:    { platform_admin: 'full',   var_admin: 'limited',       customer_admin: 'limited' },
  storage_limits:        { platform_admin: 'full',   var_admin: 'view',          customer_admin: 'view' },
  licensing:             { platform_admin: 'full',   var_admin: 'assign',        customer_admin: 'view' },
  impersonate_users:     { platform_admin: 'full',   var_admin: 'own_customers', customer_admin: 'none' },
  delete_data:           { platform_admin: 'global', var_admin: 'tenant',        customer_admin: 'company' },
}

/** The scope a role has for a function ('none' = no access). */
export function matrixAccess(fn: MatrixFunction, role: MatrixRole): Access {
  return PERMISSION_MATRIX[fn][role]
}

/** Does this role have any access to the function? */
export function hasMatrixAccess(fn: MatrixFunction, role: MatrixRole): boolean {
  return PERMISSION_MATRIX[fn][role] !== 'none'
}
