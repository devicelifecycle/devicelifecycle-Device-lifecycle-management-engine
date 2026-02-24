// ============================================================================
// VENDOR SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeSearchInput } from '@/lib/utils'
import type {
  Vendor,
  VendorBid,
  CreateVendorInput,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

export class VendorService {
  /**
   * Get vendors with pagination
   */
  static async getVendors(
    params: PaginationParams & { search?: string; capability?: string }
  ): Promise<PaginatedResponse<Vendor>> {
    const supabase = createServerSupabaseClient()
    
    const {
      page = 1,
      page_size = 20,
      sort_by = 'company_name',
      sort_order = 'asc',
      search,
      capability,
    } = params

    let query = supabase
      .from('vendors')
      .select('*', { count: 'exact' })
      .eq('is_active', true)

    if (search) {
      const s = sanitizeSearchInput(search)
      query = query.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%`)
    }

    if (capability) {
      query = query.contains('capabilities', [capability])
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
      data: data as Vendor[],
      total: count || 0,
      page,
      page_size,
      total_pages: Math.ceil((count || 0) / page_size),
    }
  }

  /**
   * Get a single vendor by ID
   */
  static async getVendorById(id: string): Promise<Vendor | null> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    return data as Vendor
  }

  /**
   * Create a new vendor
   */
  static async createVendor(input: CreateVendorInput, orgId: string): Promise<Vendor> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendors')
      .insert({
        ...input,
        organization_id: orgId,
        quality_score: 100, // Start with perfect score
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Vendor
  }

  /**
   * Update a vendor
   */
  static async updateVendor(id: string, input: Partial<CreateVendorInput>): Promise<Vendor> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendors')
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

    return data as Vendor
  }

  /**
   * Deactivate a vendor (soft delete)
   */
  static async deleteVendor(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('vendors')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Assign vendor to an order
   */
  static async assignVendorToOrder(
    orderId: string, 
    vendorId: string,
    quantity: number,
    unitPrice: number,
    leadTimeDays: number
  ): Promise<VendorBid> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendor_bids')
      .insert({
        order_id: orderId,
        vendor_id: vendorId,
        quantity_offered: quantity,
        unit_price: unitPrice,
        total_price: quantity * unitPrice,
        lead_time_days: leadTimeDays,
        is_accepted: true,
        responded_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as VendorBid
  }

  /**
   * Get vendor bids for an order
   */
  static async getOrderVendorBids(orderId: string): Promise<VendorBid[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendor_bids')
      .select('*, vendor:vendors(*)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as VendorBid[]
  }

  /**
   * Get vendors by capability
   */
  static async getVendorsByCapability(capability: string): Promise<Vendor[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_active', true)
      .contains('capabilities', [capability])
      .order('quality_score', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as Vendor[]
  }

  /**
   * Update vendor quality score
   */
  static async updateQualityScore(vendorId: string, score: number): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('vendors')
      .update({ 
        quality_score: Math.min(100, Math.max(0, score)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)

    if (error) {
      throw new Error(error.message)
    }
  }
}
