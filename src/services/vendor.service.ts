// ============================================================================
// VENDOR SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeSearchInput } from '@/lib/utils'
import { OrderSplitService } from './order-split.service'
import type {
  Vendor,
  VendorBid,
  Order,
  CreateVendorInput,
  PaginatedResponse,
  PaginationParams,
  OrderSplitAllocation,
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
   * Assign vendor to an order (creates an accepted bid).
   * After acceptance, checks if multiple bids now cover the order quantity
   * and auto-splits the order across vendors if so.
   */
  static async assignVendorToOrder(
    orderId: string,
    vendorId: string,
    quantity: number,
    unitPrice: number,
    leadTimeDays: number,
    userId?: string
  ): Promise<VendorBid & { auto_split?: boolean; sub_orders?: Order[] }> {
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
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    const bid = data as VendorBid

    // --- Auto-split logic ---
    // Check if we now have 2+ accepted bids covering the order quantity
    if (userId) {
      try {
        const autoSplitResult = await this.tryAutoSplit(supabase, orderId, userId)
        if (autoSplitResult) {
          return { ...bid, auto_split: true, sub_orders: autoSplitResult }
        }
      } catch (e) {
        // Auto-split failed — not fatal, bid was still created
        console.error('Auto-split check failed:', e)
      }
    }

    return bid
  }

  /**
   * Check if auto-split should trigger and execute it.
   * Returns sub-orders if split was executed, null otherwise.
   */
  private static async tryAutoSplit(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    orderId: string,
    userId: string
  ): Promise<Order[] | null> {
    // 1. Check if order can be split
    const { canSplit } = await OrderSplitService.canSplitOrder(orderId)
    if (!canSplit) return null

    // 2. Get all accepted bids for this order
    const { data: acceptedBids } = await supabase
      .from('vendor_bids')
      .select('vendor_id, quantity_offered')
      .eq('order_id', orderId)
      .eq('is_accepted', true)

    if (!acceptedBids || acceptedBids.length < 2) return null

    // 3. Get order items to check total quantity
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id, quantity')
      .eq('order_id', orderId)

    if (!orderItems || orderItems.length === 0) return null

    const totalOrderQty = orderItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalBidQty = acceptedBids.reduce((sum, bid) => sum + (bid.quantity_offered || 0), 0)

    // 4. Only auto-split if bids cover the full order quantity
    if (totalBidQty < totalOrderQty) return null

    // 5. Build proportional allocations
    const allocations = this.buildProportionalAllocations(
      orderItems as Array<{ id: string; quantity: number }>,
      acceptedBids as Array<{ vendor_id: string; quantity_offered: number }>
    )

    // 6. Execute the split
    const subOrders = await OrderSplitService.executeOrderSplit(
      {
        parent_order_id: orderId,
        strategy: 'quantity',
        allocations,
      },
      userId
    )

    return subOrders
  }

  /**
   * Distribute order items proportionally across vendors based on bid quantities.
   * Uses largest remainder method for exact integer distribution.
   */
  static buildProportionalAllocations(
    orderItems: Array<{ id: string; quantity: number }>,
    bids: Array<{ vendor_id: string; quantity_offered: number }>
  ): OrderSplitAllocation[] {
    const totalBidQty = bids.reduce((sum, b) => sum + b.quantity_offered, 0)

    const allocations: OrderSplitAllocation[] = bids.map(bid => ({
      vendor_id: bid.vendor_id,
      items: [],
    }))

    for (const item of orderItems) {
      // Calculate proportional shares with remainders
      const shares = bids.map(bid => {
        const exactShare = (bid.quantity_offered / totalBidQty) * item.quantity
        return {
          vendor_id: bid.vendor_id,
          floor: Math.floor(exactShare),
          remainder: exactShare - Math.floor(exactShare),
        }
      })

      // Distribute floor values
      let distributed = shares.reduce((sum, s) => sum + s.floor, 0)
      const remaining = item.quantity - distributed

      // Distribute remaining units to vendors with largest remainders
      const sorted = [...shares].sort((a, b) => b.remainder - a.remainder)
      for (let i = 0; i < remaining; i++) {
        sorted[i].floor += 1
      }

      // Add to allocations
      for (const share of shares) {
        if (share.floor > 0) {
          const alloc = allocations.find(a => a.vendor_id === share.vendor_id)!
          alloc.items.push({ order_item_id: item.id, quantity: share.floor })
        }
      }
    }

    // Filter out allocations with no items
    return allocations.filter(a => a.items.length > 0)
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

  /**
   * Get vendor bids with split allocation details for an order
   */
  static async getVendorBidsForSplit(orderId: string): Promise<VendorBid[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendor_bids')
      .select('*, vendor:vendors(*)')
      .eq('order_id', orderId)
      .eq('is_accepted', true)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as VendorBid[]
  }
}
