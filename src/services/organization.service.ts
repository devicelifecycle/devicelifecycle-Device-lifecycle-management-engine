// ============================================================================
// ORGANIZATION SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeSearchInput } from '@/lib/utils'
import type {
  Organization,
  OrganizationType,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

export class OrganizationService {
  /**
   * Get organizations with pagination
   */
  static async getOrganizations(
    params: PaginationParams & { search?: string; type?: OrganizationType }
  ): Promise<PaginatedResponse<Organization>> {
    const supabase = await createServerSupabaseClient()

    const {
      page = 1,
      page_size = 20,
      sort_by = 'name',
      sort_order = 'asc',
      search,
      type,
    } = params

    let query = supabase
      .from('organizations')
      .select('*', { count: 'exact' })
      .eq('is_active', true)

    if (search) {
      const s = sanitizeSearchInput(search)
      query = query.or(`name.ilike.%${s}%,contact_email.ilike.%${s}%`)
    }

    if (type) {
      query = query.eq('type', type)
    }

    const ALLOWED_SORT = ['name', 'type', 'contact_email', 'created_at', 'updated_at'] as const
    const safeSortBy = ALLOWED_SORT.includes(sort_by as (typeof ALLOWED_SORT)[number]) ? sort_by : 'name'
    query = query.order(safeSortBy, { ascending: sort_order === 'asc' })

    const from = (page - 1) * page_size
    const to = from + page_size - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    return {
      data: data as Organization[],
      total: count || 0,
      page,
      page_size,
      total_pages: Math.ceil((count || 0) / page_size),
    }
  }

  /**
   * Get a single organization by ID
   */
  static async getOrganizationById(id: string): Promise<Organization | null> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    return data as Organization
  }

  /**
   * Create a new organization
   */
  static async createOrganization(input: {
    name: string
    type: OrganizationType
    contact_email?: string
    contact_phone?: string
    address?: Record<string, unknown>
    settings?: Record<string, unknown>
  }): Promise<Organization> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('organizations')
      .insert({
        ...input,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Organization
  }

  /**
   * Update an organization
   */
  static async updateOrganization(
    id: string,
    input: Partial<{
      name: string
      type: OrganizationType
      contact_email: string
      contact_phone: string
      address: Record<string, unknown>
      settings: Record<string, unknown>
      is_active: boolean
    }>
  ): Promise<Organization> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('organizations')
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

    return data as Organization
  }

  /**
   * Deactivate an organization (soft delete)
   */
  static async deactivateOrganization(id: string): Promise<void> {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('organizations')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }
  }
}
