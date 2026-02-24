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
    }
  ): Promise<PaginatedResponse<Device>> {
    const supabase = createServerSupabaseClient()
    
    const {
      page = 1,
      page_size = 20,
      sort_by = 'make',
      sort_order = 'asc',
      search,
      category,
      make,
    } = params

    let query = supabase
      .from('device_catalog')
      .select('*', { count: 'exact' })
      .eq('is_active', true)

    if (search) {
      const s = sanitizeSearchInput(search)
      query = query.or(`make.ilike.%${s}%,model.ilike.%${s}%`)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (make) {
      query = query.eq('make', make)
    }

    query = query.order(sort_by || 'make', { ascending: sort_order === 'asc' })

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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
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

    return data as Device
  }

  /**
   * Delete a device (soft delete)
   */
  static async deleteDevice(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
      .select('id, make, model, category, specifications')
      .eq('is_active', true)
      .or(`make.ilike.%${sanitizeSearchInput(query)}%,model.ilike.%${sanitizeSearchInput(query)}%`)
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    return data as Device[]
  }

  /**
   * Get all makes (brands)
   */
  static async getMakes(): Promise<string[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
      .select('make')
      .eq('is_active', true)

    if (error) {
      throw new Error(error.message)
    }

    // Get unique makes
    const makes = Array.from(new Set(data.map(d => d.make)))
    return makes.sort()
  }

  /**
   * Get models by make
   */
  static async getModelsByMake(make: string): Promise<Device[]> {
    const supabase = createServerSupabaseClient()

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
