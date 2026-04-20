// ============================================================================
// VENDOR SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sanitizeSearchInput } from '@/lib/utils'
import { OrderSplitService } from './order-split.service'
import { NotificationService } from './notification.service'
import { EmailService } from './email.service'
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
    params: PaginationParams & { search?: string; capability?: string; is_active?: boolean }
  ): Promise<PaginatedResponse<Vendor>> {
    const supabase = await createServerSupabaseClient()
    
    const {
      page = 1,
      page_size = 20,
      sort_by = 'company_name',
      sort_order = 'asc',
      search,
      capability,
      is_active,
    } = params

    let query = supabase
      .from('vendors')
      .select('*', { count: 'exact' })

    // Filter by is_active only when explicitly provided; omit to show all (admin view)
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active)
    }

    if (search) {
      const s = sanitizeSearchInput(search)
      query = query.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%`)
    }

    if (capability) {
      query = query.contains('capabilities', [capability])
    }

    const ALLOWED_SORT = ['company_name', 'contact_name', 'contact_email', 'created_at', 'updated_at', 'rating'] as const
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
      data: data as Vendor[],
      total: count || 0,
      page,
      page_size,
      total_pages: Math.ceil((count || 0) / page_size),
    }
  }

  /**
   * Get CPO orders open for bidding — no vendor assigned, status in [accepted, sourcing].
   * Broadcast to all vendors; any vendor can bid.
   */
  static async getOpenOrdersForBidding(params: { page?: number; page_size?: number }) {
    // Open CPO orders are intentionally visible to every vendor org for bidding.
    // Use the service-role client here so vendor RLS on `orders` does not hide
    // unassigned sourcing orders from the vendor marketplace view.
    const supabase = createServiceRoleClient()
    const page = params.page ?? 1
    const page_size = params.page_size ?? 20
    const from = (page - 1) * page_size
    const to = from + page_size - 1

    // Vendors must NOT see customer/organization info — only order + device details
    const { data, error, count } = await supabase
      .from('orders')
      .select('id, order_number, type, status, total_quantity, created_at, updated_at, items:order_items(id, quantity, storage, claimed_condition, device:device_catalog(make, model))', { count: 'exact' })
      .eq('type', 'cpo')
      .is('vendor_id', null)
      .in('status', ['sourcing', 'accepted'])
      .is('parent_order_id', null)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(error.message)
    }

    return {
      data: (data || []) as unknown as Order[],
      total: count || 0,
      page,
      page_size,
      total_pages: Math.ceil((count || 0) / page_size),
    }
  }

  /**
   * Get vendor's orders (orders where vendor_id = vendor)
   */
  static async getVendorOrders(vendorId: string, limit = 50) {
    const supabase = await createServerSupabaseClient()

    // Vendors must NOT see customer/organization info
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, type, status, total_quantity, created_at, updated_at, items:order_items(id, quantity, storage, claimed_condition, device:device_catalog(make, model))')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    return data as unknown as Order[]
  }

  /**
   * Get a single vendor by ID
   */
  static async getVendorById(id: string): Promise<Vendor | null> {
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendors')
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

    return data as Vendor
  }

  /**
   * Update a vendor
   */
  static async updateVendor(id: string, input: Partial<CreateVendorInput>): Promise<Vendor> {
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendor_bids')
      .insert({
        order_id: orderId,
        vendor_id: vendorId,
        quantity: quantity,
        unit_price: unitPrice,
        total_price: quantity * unitPrice,
        lead_time_days: leadTimeDays,
        status: 'accepted',
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

    // Notify vendor users that they have been assigned to this order
    try {
      const srClient = createServiceRoleClient()
      const { data: vendor } = await srClient
        .from('vendors')
        .select('contact_email, contact_name, contact_phone, organization_id')
        .eq('id', vendorId)
        .single()

      // In-app notification to all active users in vendor's organization
      if (vendor?.organization_id) {
        const { data: vendorUsers } = await srClient
          .from('users')
          .select('id')
          .eq('organization_id', vendor.organization_id)
          .eq('is_active', true)
        for (const u of vendorUsers || []) {
          await NotificationService.createNotification({
            user_id: u.id,
            type: 'in_app',
            title: 'New Order Assignment',
            message: `You have been assigned to fulfil Order #${orderId}. Quantity: ${quantity} unit${quantity !== 1 ? 's' : ''} at $${unitPrice}/unit.`,
            link: `/orders/${orderId}`,
            metadata: { order_id: orderId, vendor_id: vendorId },
          })
        }
      }

      // Email notification to vendor contact
      const effectiveEmail = vendor?.contact_email?.endsWith('@login.local')
        ? undefined
        : vendor?.contact_email
      if (effectiveEmail) {
        const subject = `New Order Assignment — Order #${orderId}`
        const html = `<p>Hi ${vendor?.contact_name || 'Vendor'},</p>
<p>You have been assigned to fulfil an order.</p>
<ul>
  <li><strong>Order:</strong> #${orderId}</li>
  <li><strong>Quantity:</strong> ${quantity} unit${quantity !== 1 ? 's' : ''}</li>
  <li><strong>Unit Price:</strong> $${unitPrice}</li>
  <li><strong>Total:</strong> $${(quantity * unitPrice).toFixed(2)}</li>
  <li><strong>Lead Time:</strong> ${leadTimeDays} day${leadTimeDays !== 1 ? 's' : ''}</li>
</ul>
<p>Please log in to the platform to review and confirm the order details.</p>`
        await EmailService.sendEmail(effectiveEmail, subject, html)
      }
    } catch (notifyErr) {
      // Non-fatal: bid was already created successfully
      console.error('[VendorService] assignVendorToOrder notification failed:', notifyErr)
    }

    return bid
  }

  /**
   * Check if auto-split should trigger and execute it.
   * Returns sub-orders if split was executed, null otherwise.
   */
  private static async tryAutoSplit(
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
    orderId: string,
    userId: string
  ): Promise<Order[] | null> {
    // 1. Check if order can be split
    const { canSplit } = await OrderSplitService.canSplitOrder(orderId)
    if (!canSplit) return null

    // 2. Get all accepted bids for this order
    const { data: acceptedBids } = await supabase
      .from('vendor_bids')
      .select('vendor_id, quantity')
      .eq('order_id', orderId)
      .eq('status', 'accepted')

    if (!acceptedBids || acceptedBids.length < 2) return null

    // 3. Get order items to check total quantity
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id, quantity')
      .eq('order_id', orderId)

    if (!orderItems || orderItems.length === 0) return null

    const totalOrderQty = orderItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalBidQty = acceptedBids.reduce((sum, bid) => sum + (bid.quantity || 0), 0)

    // 4. Only auto-split if bids cover the full order quantity
    if (totalBidQty < totalOrderQty) return null

    // 5. Build proportional allocations
    const allocations = this.buildProportionalAllocations(
      orderItems as Array<{ id: string; quantity: number }>,
      acceptedBids as Array<{ vendor_id: string; quantity: number }>
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
    bids: Array<{ vendor_id: string; quantity: number }>
  ): OrderSplitAllocation[] {
    const totalBidQty = bids.reduce((sum, b) => sum + b.quantity, 0)

    const allocations: OrderSplitAllocation[] = bids.map(bid => ({
      vendor_id: bid.vendor_id,
      items: [],
    }))

    for (const item of orderItems) {
      // Calculate proportional shares with remainders
      const shares = bids.map(bid => {
        const exactShare = (bid.quantity / totalBidQty) * item.quantity
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
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_active', true)
      .contains('capabilities', [capability])
      .order('rating', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as Vendor[]
  }

  /**
   * Update vendor rating
   */
  static async updateRating(vendorId: string, score: number): Promise<void> {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('vendors')
      .update({
        rating: Math.min(5, Math.max(0, Math.round(score * 100) / 100)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Submit a vendor bid for an order
   */
  static async submitBid(input: {
    order_id: string
    vendor_id: string
    quantity: number
    unit_price: number
    lead_time_days: number
    warranty_days?: number
    notes?: string
  }): Promise<VendorBid & { auto_accepted?: boolean }> {
    // Bid submission can originate from vendor-facing routes where the order is
    // intentionally visible via a marketplace view, not direct RLS. Use the
    // service role so inserts, order reads, and auto-accept updates stay in sync.
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('vendor_bids')
      .insert({
        order_id: input.order_id,
        vendor_id: input.vendor_id,
        quantity: input.quantity,
        unit_price: input.unit_price,
        total_price: input.quantity * input.unit_price,
        lead_time_days: input.lead_time_days,
        warranty_days: input.warranty_days,
        notes: input.notes,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    const bid = data as VendorBid

    // Auto-assign (first bid wins): if order has no vendor and this bid covers full quantity, accept immediately
    const { data: order } = await supabase
      .from('orders')
      .select('id, vendor_id, total_quantity')
      .eq('id', input.order_id)
      .single()

    if (
      order &&
      !order.vendor_id &&
      input.quantity >= (order.total_quantity || 0) &&
      order.total_quantity > 0
    ) {
      try {
        const accepted = await this.updateBidStatus(bid.id, 'accepted')
        return { ...accepted, auto_accepted: true }
      } catch (e) {
        // Another bid may have won in parallel — leave as pending
        return bid
      }
    }

    return bid
  }

  /**
   * Update a vendor bid's status (accept or reject).
   * When accepting:
   *   - Applies CPO markup to order items
   *   - Recalculates order totals
   *   - Rejects all other pending bids for the same order
   * When rejecting: just updates the bid status.
   */
  static async updateBidStatus(
    bidId: string,
    status: 'accepted' | 'rejected',
    cpoMarkupPercent?: number
  ): Promise<VendorBid> {
    // Bid acceptance updates multiple tables (vendor_bids, order_items, orders).
    // Use the service role so workflow automation is not blocked by caller RLS.
    const supabase = createServiceRoleClient()

    // 1. Fetch the bid
    const { data: bid, error: bidError } = await supabase
      .from('vendor_bids')
      .select('*, vendor:vendors(*)')
      .eq('id', bidId)
      .single()

    if (bidError || !bid) {
      throw new Error(bidError?.message || 'Bid not found')
    }

    if (bid.status !== 'pending') {
      throw new Error(`Bid is already ${bid.status}`)
    }

    // 2. Update the bid status
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'accepted') {
      // status already set above
    }

    const { data: updatedBid, error: updateError } = await supabase
      .from('vendor_bids')
      .update(updatePayload)
      .eq('id', bidId)
      .select('*, vendor:vendors(*)')
      .single()

    if (updateError) {
      throw new Error(updateError.message)
    }

    // 3. If accepted, update order items and reject other bids
    if (status === 'accepted') {
      // Determine markup
      let markup = cpoMarkupPercent
      if (markup == null) {
        // Try to read from pricing_settings table
        const { data: settings } = await supabase
          .from('pricing_settings')
          .select('setting_value')
          .eq('setting_key', 'cpo_markup_percent')
          .single()
        markup = settings?.setting_value ? Number(settings.setting_value) : 15 // default 15%
      }

      // Calculate customer price with markup
      const customerUnitPrice = Math.round(bid.unit_price * (1 + markup / 100) * 100) / 100

      // Update order items unit_price
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('id, quantity')
        .eq('order_id', bid.order_id)

      if (orderItems && orderItems.length > 0) {
        // Update each item's unit_price
        for (const item of orderItems) {
          await supabase
            .from('order_items')
            .update({
              unit_price: customerUnitPrice,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)
        }

        // Recalculate order totals
        const totalAmount = orderItems.reduce(
          (sum, item) => sum + customerUnitPrice * item.quantity,
          0
        )
        await supabase
          .from('orders')
          .update({
            total_amount: Math.round(totalAmount * 100) / 100,
            quoted_amount: Math.round(totalAmount * 100) / 100,
            vendor_id: bid.vendor_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bid.order_id)
      }

      // Reject all other pending bids for this order
      await supabase
        .from('vendor_bids')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', bid.order_id)
        .neq('id', bidId)
        .eq('status', 'pending')
    }

    return updatedBid as VendorBid
  }

  /**
   * Get vendor bids with split allocation details for an order
   */
  static async getVendorBidsForSplit(orderId: string): Promise<VendorBid[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('vendor_bids')
      .select('*, vendor:vendors(*)')
      .eq('order_id', orderId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as VendorBid[]
  }
}
