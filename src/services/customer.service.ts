// ============================================================================
// CUSTOMER SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeSearchInput } from '@/lib/utils'
import type {
  Customer,
  CreateCustomerInput,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

export class CustomerService {
  /**
   * Get customers with pagination
   */
  static async getCustomers(
    params: PaginationParams & {
      search?: string
      organization_id?: string
      is_active?: boolean
      /** Extra delegated-role filter (region / assigned rep). Inert when absent. */
      scope?: { column: string; value: string } | null
    }
  ): Promise<PaginatedResponse<Customer>> {
    const supabase = await createServerSupabaseClient()

    const {
      page = 1,
      page_size = 20,
      sort_by = 'company_name',
      sort_order = 'asc',
      search,
      organization_id,
      is_active = true,
      scope,
    } = params

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('is_active', is_active)

    if (organization_id) {
      query = query.eq('organization_id', organization_id)
    }

    // Delegated VAR scoping (Regional Manager → region, Sales Rep → own).
    // Applied on top of tenant RLS; null for non-delegated roles.
    if (scope) {
      query = query.eq(scope.column, scope.value)
    }

    if (search) {
      const s = sanitizeSearchInput(search)
      query = query.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%,contact_email.ilike.%${s}%`)
    }

    const ALLOWED_SORT = ['company_name', 'contact_name', 'contact_email', 'created_at', 'updated_at'] as const
    const safeSortBy = ALLOWED_SORT.includes(sort_by as (typeof ALLOWED_SORT)[number]) ? sort_by : 'company_name'
    query = query.order(safeSortBy, { ascending: sort_order === 'asc' })

    const from = (page - 1) * page_size
    const to = from + page_size - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    return {
      data: data as Customer[],
      total: count || 0,
      page,
      page_size,
      total_pages: Math.ceil((count || 0) / page_size),
    }
  }

  /**
   * Get a single customer by ID
   */
  static async getCustomerById(id: string): Promise<Customer | null> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    return data as Customer
  }

  /**
   * Create a new customer. orgId links to organizations table (type 'customer').
   */
  static async createCustomer(input: CreateCustomerInput, orgId?: string, tenantId?: string): Promise<Customer> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...input,
        organization_id: orgId ?? null,
        is_active: true,
        // Scope to the creating tenant when known; otherwise inherit the DB
        // default (platform tenant), so existing single-tenant creates are unchanged.
        ...(tenantId ? { tenant_id: tenantId } : {}),
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Customer
  }

  /**
   * Get customers linked to an organization
   */
  static async getCustomersByOrganizationId(organizationId: string): Promise<Customer[]> {
    const result = await this.getCustomers({ organization_id: organizationId, page_size: 100 })
    return result.data
  }

  /**
   * Update a customer
   */
  static async updateCustomer(id: string, input: Partial<CreateCustomerInput>): Promise<Customer> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('customers')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Customer
  }

  /**
   * Deactivate a customer (soft delete). Also frees up the associated portal
   * login's email so the same address can be re-registered immediately —
   * otherwise the org's customer user row keeps the email reserved forever.
   */
  static async deactivateCustomer(id: string): Promise<void> {
    const supabase = await createServerSupabaseClient()

    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('organization_id')
      .eq('id', id)
      .single()

    if (fetchError) {
      throw new Error(fetchError.message)
    }

    const { error } = await supabase
      .from('customers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }

    if (customer?.organization_id) {
      const { releasePortalLoginEmail } = await import('./user-provisioning.service')
      await releasePortalLoginEmail(customer.organization_id, 'customer')
    }
  }

  /**
   * Get customer's orders
   */
  static async getCustomerOrders(customerId: string, limit = 10) {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * Search customers (for autocomplete)
   */
  static async searchCustomers(query: string, limit = 10): Promise<Partial<Customer>[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, contact_name, contact_email')
      .eq('is_active', true)
      .or(`company_name.ilike.%${sanitizeSearchInput(query)}%,contact_name.ilike.%${sanitizeSearchInput(query)}%`)
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    return data as Partial<Customer>[]
  }
}
