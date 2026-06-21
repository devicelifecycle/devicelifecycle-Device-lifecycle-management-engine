// ============================================================================
// VENDOR PERFORMANCE METRICS
// Shared by the admin-facing GET /api/vendors/[id]/performance and the
// vendor-facing self-service GET /api/vendors/me/performance — same
// underlying numbers, just resolved against a different caller-supplied id.
// ============================================================================

type ServiceRoleClientLike = { from: any }

export interface VendorPerformance {
  bids: {
    total: number
    accepted: number
    rejected: number
    pending: number
    expired: number
    win_rate_percent: number | null
    avg_accepted_unit_price: number | null
    avg_lead_time_days: number | null
  }
  orders: {
    total: number
    active: number
    completed: number
    total_fulfilled_value: number
    total_devices_fulfilled: number
  }
}

export async function computeVendorPerformance(
  service: ServiceRoleClientLike,
  vendorId: string,
): Promise<VendorPerformance> {
  const { data: bids } = await service
    .from('vendor_bids')
    .select('id, status, unit_price, quantity, lead_time_days, created_at')
    .eq('vendor_id', vendorId)

  const allBids = bids || []
  const totalBids = allBids.length
  const acceptedBids = allBids.filter((b: any) => b.status === 'accepted').length
  const rejectedBids = allBids.filter((b: any) => b.status === 'rejected').length
  const pendingBids = allBids.filter((b: any) => b.status === 'pending').length
  const expiredBids = allBids.filter((b: any) => b.status === 'expired').length
  const winRate = totalBids > 0 ? Math.round((acceptedBids / totalBids) * 100) : null

  const acceptedBidPrices = allBids
    .filter((b: any) => b.status === 'accepted' && b.unit_price != null)
    .map((b: any) => Number(b.unit_price))
  const avgAcceptedUnitPrice = acceptedBidPrices.length > 0
    ? Math.round((acceptedBidPrices.reduce((s: number, p: number) => s + p, 0) / acceptedBidPrices.length) * 100) / 100
    : null

  const acceptedLeadTimes = allBids.filter((b: any) => b.status === 'accepted' && b.lead_time_days != null).map((b: any) => b.lead_time_days as number)
  const avgLeadTimeDays = acceptedLeadTimes.length > 0
    ? Math.round(acceptedLeadTimes.reduce((s: number, d: number) => s + d, 0) / acceptedLeadTimes.length)
    : null

  const { data: orders } = await service
    .from('orders')
    .select('id, status, total_amount, total_quantity, accepted_at, updated_at, created_at')
    .eq('vendor_id', vendorId)

  const allOrders = orders || []
  const totalOrders = allOrders.length
  const activeOrders = allOrders.filter((o: any) => ['accepted', 'sourcing', 'sourced', 'shipped'].includes(o.status)).length
  const completedOrders = allOrders.filter((o: any) => ['delivered', 'closed'].includes(o.status)).length
  const totalFulfilledValue = allOrders
    .filter((o: any) => ['delivered', 'closed'].includes(o.status))
    .reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
  const totalDevicesFulfilled = allOrders
    .filter((o: any) => ['delivered', 'closed'].includes(o.status))
    .reduce((sum: number, o: any) => sum + (o.total_quantity || 0), 0)

  return {
    bids: {
      total: totalBids,
      accepted: acceptedBids,
      rejected: rejectedBids,
      pending: pendingBids,
      expired: expiredBids,
      win_rate_percent: winRate,
      avg_accepted_unit_price: avgAcceptedUnitPrice,
      avg_lead_time_days: avgLeadTimeDays,
    },
    orders: {
      total: totalOrders,
      active: activeOrders,
      completed: completedOrders,
      total_fulfilled_value: totalFulfilledValue,
      total_devices_fulfilled: totalDevicesFulfilled,
    },
  }
}

export interface BidComparisonPoint {
  order_id: string
  your_unit_price: number
  winning_unit_price: number | null
  you_won: boolean
  delta_percent: number | null // (your_price - winning_price) / winning_price * 100 — positive means you bid above the winner
}

/**
 * For each of this vendor's bids on an order that has since been decided
 * (some bid on it was accepted), compares their price to the winning price.
 * Lets a vendor see "you're bidding X% above the winning price on average"
 * without exposing the competing vendors' identities.
 */
export async function computeBidComparison(
  service: ServiceRoleClientLike,
  vendorId: string,
): Promise<BidComparisonPoint[]> {
  const { data: myBids } = await service
    .from('vendor_bids')
    .select('id, order_id, unit_price, status')
    .eq('vendor_id', vendorId)
    .not('unit_price', 'is', null)

  const myBidList = myBids || []
  if (myBidList.length === 0) return []

  const orderIds = Array.from(new Set(myBidList.map((b: any) => b.order_id)))

  const { data: winningBids } = await service
    .from('vendor_bids')
    .select('order_id, unit_price')
    .in('order_id', orderIds)
    .eq('status', 'accepted')

  const winningByOrder = new Map<string, number>()
  for (const b of winningBids || []) {
    if (b.unit_price != null) winningByOrder.set(b.order_id, Number(b.unit_price))
  }

  return myBidList
    .filter((b: any) => winningByOrder.has(b.order_id))
    .map((b: any) => {
      const winning = winningByOrder.get(b.order_id)!
      const yours = Number(b.unit_price)
      return {
        order_id: b.order_id,
        your_unit_price: yours,
        winning_unit_price: winning,
        you_won: b.status === 'accepted',
        delta_percent: winning > 0 ? Math.round(((yours - winning) / winning) * 1000) / 10 : null,
      }
    })
}
