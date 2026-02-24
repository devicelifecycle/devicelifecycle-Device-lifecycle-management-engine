// ============================================================================
// IMEI SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeSearchInput } from '@/lib/utils'
import type {
  IMEIRecord,
  CustodyEvent,
  DeviceCondition,
} from '@/types'

export class IMEIService {
  /**
   * Get IMEI record by IMEI number
   */
  static async getByIMEI(imei: string): Promise<IMEIRecord | null> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('imei_records')
      .select('*, device:device_catalog(*)')
      .eq('imei', imei)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    return data as IMEIRecord
  }

  /**
   * Create a new IMEI record
   */
  static async createIMEIRecord(input: {
    imei: string
    serial_number?: string
    device_catalog_id: string
    storage: string
    color?: string
    condition: DeviceCondition
    source_vendor_id?: string
    purchase_date?: string
    warranty_start_date?: string
    warranty_end_date?: string
    is_locked?: boolean
    lock_type?: string
  }, actorId: string): Promise<IMEIRecord> {
    const supabase = createServerSupabaseClient()

    // Check if IMEI already exists
    const existing = await this.getByIMEI(input.imei)
    if (existing) {
      throw new Error('IMEI already exists in the system')
    }

    const custodyEvent = {
      event: 'REGISTERED',
      timestamp: new Date().toISOString(),
      actor_id: actorId,
      actor_type: 'user',
      notes: undefined as string | undefined,
    }

    const { data, error } = await supabase
      .from('imei_records')
      .insert({
        ...input,
        chain_of_custody: [custodyEvent],
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as IMEIRecord
  }

  /**
   * Update IMEI record
   */
  static async updateIMEIRecord(
    imei: string, 
    input: Partial<IMEIRecord>,
    actorId: string,
    eventDescription?: string
  ): Promise<IMEIRecord> {
    const supabase = createServerSupabaseClient()

    // Get current record
    const current = await this.getByIMEI(imei)
    if (!current) {
      throw new Error('IMEI record not found')
    }

    // Add custody event
    const custodyEvent = {
      event: eventDescription || 'UPDATED',
      timestamp: new Date().toISOString(),
      actor_id: actorId,
      actor_type: 'user',
      notes: undefined as string | undefined,
    }

    const updatedCustody = [...(current.chain_of_custody || []), custodyEvent]

    const { data, error } = await supabase
      .from('imei_records')
      .update({
        ...input,
        chain_of_custody: updatedCustody,
        updated_at: new Date().toISOString(),
      })
      .eq('imei', imei)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as IMEIRecord
  }

  /**
   * Add custody event to IMEI record
   */
  static async addCustodyEvent(
    imei: string,
    event: string,
    actorId: string,
    actorType: 'user' | 'vendor' | 'customer' | 'system',
    notes?: string
  ): Promise<IMEIRecord> {
    const supabase = createServerSupabaseClient()

    const current = await this.getByIMEI(imei)
    if (!current) {
      throw new Error('IMEI record not found')
    }

    const custodyEvent = {
      event,
      timestamp: new Date().toISOString(),
      actor_id: actorId,
      actor_type: actorType,
      notes: notes || undefined,
    }

    const updatedCustody = [...(current.chain_of_custody || []), custodyEvent]

    const { data, error } = await supabase
      .from('imei_records')
      .update({
        chain_of_custody: updatedCustody,
        updated_at: new Date().toISOString(),
      })
      .eq('imei', imei)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as IMEIRecord
  }

  /**
   * Assign IMEI to customer
   */
  static async assignToCustomer(
    imei: string,
    customerId: string,
    actorId: string
  ): Promise<IMEIRecord> {
    // Update with customer assignment - cast to Partial<IMEIRecord> to handle the property
    const updateData: Partial<IMEIRecord> = { current_customer_id: customerId }
    return this.updateIMEIRecord(
      imei,
      updateData,
      actorId,
      'ASSIGNED_TO_CUSTOMER'
    )
  }

  /**
   * Check warranty eligibility
   */
  static async checkWarrantyEligibility(imei: string): Promise<{
    eligible: boolean
    reason?: string
    liable_vendor_id?: string
    warranty_remaining_days?: number
    warranty_end_date?: string
  }> {
    const record = await this.getByIMEI(imei)

    if (!record) {
      return { eligible: false, reason: 'IMEI not found in system' }
    }

    if (!record.warranty_end_date) {
      return { eligible: false, reason: 'No warranty information on file' }
    }

    const now = new Date()
    const warrantyEnd = new Date(record.warranty_end_date)

    if (now > warrantyEnd) {
      return { 
        eligible: false, 
        reason: 'Warranty expired',
        warranty_end_date: record.warranty_end_date,
      }
    }

    const remainingDays = Math.ceil((warrantyEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return {
      eligible: true,
      liable_vendor_id: record.source_vendor_id || undefined,
      warranty_remaining_days: remainingDays,
      warranty_end_date: record.warranty_end_date,
    }
  }

  /**
   * Search IMEI records
   */
  static async searchIMEI(query: string, limit = 20): Promise<IMEIRecord[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('imei_records')
      .select('*, device:device_catalog(*)')
      .or(`imei.ilike.%${sanitizeSearchInput(query)}%,serial_number.ilike.%${sanitizeSearchInput(query)}%`)
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    return data as IMEIRecord[]
  }

  /**
   * Get IMEI records by vendor
   */
  static async getByVendor(vendorId: string): Promise<IMEIRecord[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('imei_records')
      .select('*, device:device_catalog(*)')
      .eq('source_vendor_id', vendorId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as IMEIRecord[]
  }

  /**
   * Get IMEI records by customer
   */
  static async getByCustomer(customerId: string): Promise<IMEIRecord[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('imei_records')
      .select('*, device:device_catalog(*)')
      .eq('current_customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as IMEIRecord[]
  }
}
