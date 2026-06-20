// ============================================================================
// DEVICE SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeSearchInput } from '@/lib/utils'
import type {
  Device,
  DeviceCategory,
  CreateDeviceInput,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

export class DeviceService {
  /**
   * Get devices with pagination
   */
  static async getDevices(
    params: PaginationParams & {
      search?: string;
      category?: DeviceCategory;
      make?: string;
      recycling?: 'recycling_only' | 'other_only';
    }
  ): Promise<PaginatedResponse<Device>> {
    const supabase = await createServerSupabaseClient()

    const {
      page = 1,
      page_size = 20,
      sort_by = 'make',
      sort_order = 'asc',
      search,
      category,
      make,
      recycling,
    } = params

    let query = supabase
      .from('device_catalog')
      .select('*', { count: 'exact' })
      .eq('is_active', true)

    if (search) {
      const tokens = sanitizeSearchInput(search).split(/\s+/).filter(Boolean)
      for (const token of tokens) {
        // Color/storage now live in specifications (not baked into model
        // text), so "Black iPhone" or "128GB" need to match there too —
        // otherwise color-based search regressed to zero results once the
        // catalog was cleaned up to stop storing color in the model field.
        query = query.or(`make.ilike.%${token}%,model.ilike.%${token}%,specifications->>colors.ilike.%${token}%,specifications->>storage_options.ilike.%${token}%`)
      }
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (make) {
      query = query.eq('make', make)
    }

    if (recycling === 'recycling_only') {
      query = query.eq('specifications->>recommended_for_recycling', 'true')
    } else if (recycling === 'other_only') {
      query = query.or('specifications->>recommended_for_recycling.is.null,specifications->>recommended_for_recycling.eq.false')
    }

    const ALLOWED_SORT = ['make', 'model', 'category', 'created_at', 'updated_at', 'base_price'] as const
    const safeSortBy = ALLOWED_SORT.includes((sort_by || 'make') as (typeof ALLOWED_SORT)[number]) ? (sort_by || 'make') : 'make'
    query = query.order(safeSortBy, { ascending: sort_order === 'asc' })

    const from = (page - 1) * (page_size || 20)
    const to = from + (page_size || 20) - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    return {
      data: data as Device[],
      total: count || 0,
      page,
      page_size: page_size || 20,
      total_pages: Math.ceil((count || 0) / (page_size || 20)),
    }
  }

  /**
   * Get a single device by ID
   */
  static async getDeviceById(id: string): Promise<Device | null> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    return data as Device
  }

  /**
   * Create a new device
   */
  static async createDevice(input: CreateDeviceInput): Promise<Device> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
      .insert({
        ...input,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Device
  }

  /**
   * Update a device
   */
  static async updateDevice(id: string, input: Partial<CreateDeviceInput>): Promise<Device> {
    const supabase = await createServerSupabaseClient()

    let updateData: Record<string, unknown> = {
      ...input,
      updated_at: new Date().toISOString(),
    }

    // Merge specifications into existing JSONB to avoid overwriting unrelated fields
    if (input.specifications !== undefined) {
      const { data: current } = await supabase
        .from('device_catalog')
        .select('specifications')
        .eq('id', id)
        .single()
      updateData.specifications = { ...(current?.specifications || {}), ...input.specifications }
    }

    const { data, error } = await supabase
      .from('device_catalog')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Device
  }

  /**
   * Delete a device (soft delete)
   */
  static async deleteDevice(id: string): Promise<void> {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('device_catalog')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Search devices (for autocomplete)
   */
  static async searchDevices(query: string, limit = 10): Promise<Device[]> {
    const supabase = await createServerSupabaseClient()

    const tokens = sanitizeSearchInput(query).split(/\s+/).filter(Boolean)
    let dbQuery = supabase
      .from('device_catalog')
      .select('id, make, model, category, specifications')
      .eq('is_active', true)
    for (const token of tokens) {
      dbQuery = dbQuery.or(`make.ilike.%${token}%,model.ilike.%${token}%`)
    }
    const { data, error } = await dbQuery.limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    return data as Device[]
  }

  /**
   * Get all makes (brands)
   */
  static async getMakes(): Promise<string[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
      .select('make')
      .eq('is_active', true)

    if (error) {
      throw new Error(error.message)
    }

    const makes = Array.from(new Set((data || []).map(d => d.make)))
    return makes.sort()
  }

  /**
   * Get models by make
   */
  static async getModelsByMake(make: string): Promise<Device[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('make', make)
      .eq('is_active', true)
      .order('model', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as Device[]
  }
}
