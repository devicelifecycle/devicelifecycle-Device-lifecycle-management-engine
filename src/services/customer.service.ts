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
    params: PaginationParams & { search?: string; organization_id?: string }
  ): Promise<PaginatedResponse<Customer>> {
    const supabase = createServerSupabaseClient()
    
    const {
      page = 1,
      page_size = 20,
      sort_by = 'company_name',
      sort_order = 'asc',
      search,
      organization_id,
    } = params

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('is_active', true)

    if (organization_id) {
      query = query.eq('organization_id', organization_id)
    }

    if (search) {
      const s = sanitizeSearchInput(search)
      query = query.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%,contact_email.ilike.%${s}%`)
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' })

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
    const supabase = createServerSupabaseClient()

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
   * Create a new customer
   */
  static async createCustomer(input: CreateCustomerInput, orgId: string): Promise<Customer> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...input,
        organization_id: orgId,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Customer
  }

  /**
   * Update a customer
   */
  static async updateCustomer(id: string, input: Partial<CreateCustomerInput>): Promise<Customer> {
    const supabase = createServerSupabaseClient()

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
   * Deactivate a customer (soft delete)
   */
  static async deactivateCustomer(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('customers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Get customer's orders
   */
  static async getCustomerOrders(customerId: string, limit = 10) {
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

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
