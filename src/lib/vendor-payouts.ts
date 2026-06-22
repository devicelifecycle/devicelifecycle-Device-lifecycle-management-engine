// ============================================================================
// VENDOR PAYOUT STATUS
// Buckets a vendor's CPO sourcing orders by where they sit in the shared
// payment pipeline (qc_complete -> payment_processing -> payment_sent ->
// closed). Shared by the vendor self-service GET /api/vendors/me/payouts.
// ============================================================================

type ServiceRoleClientLike = { from: any }

const IN_FULFILLMENT_STATUSES = ['accepted', 'sourcing', 'sourced', 'shipped_to_coe', 'received', 'in_triage']
const PENDING_PAYMENT_STATUSES = ['qc_complete', 'mismatch_review', 'ready_to_ship', 'shipped', 'delivered']
const PAID_STATUSES = ['payment_sent', 'closed']

export interface VendorPayoutOrder {
  id: string
  order_number: string
  status: string
  total_amount: number
  total_quantity: number
  payment_method: string | null
  payment_reference: string | null
  payment_processed_at: string | null
  updated_at: string
}

export interface VendorPayoutSummary {
  total_paid: number
  total_pending: number
  orders_awaiting_payment: number
  orders_paid: number
  in_fulfillment: VendorPayoutOrder[]
  pending_payment: VendorPayoutOrder[]
  payment_processing: VendorPayoutOrder[]
  paid: VendorPayoutOrder[]
}

export async function computeVendorPayouts(
  service: ServiceRoleClientLike,
  vendorId: string,
): Promise<VendorPayoutSummary> {
  const { data } = await service
    .from('orders')
    .select('id, order_number, status, total_amount, total_quantity, payment_method, payment_reference, payment_processed_at, updated_at')
    .eq('vendor_id', vendorId)
    .eq('type', 'cpo')
    .order('updated_at', { ascending: false })

  const orders: VendorPayoutOrder[] = data || []

  const inFulfillment = orders.filter((o) => IN_FULFILLMENT_STATUSES.includes(o.status))
  const pendingPayment = orders.filter((o) => PENDING_PAYMENT_STATUSES.includes(o.status))
  const paymentProcessing = orders.filter((o) => o.status === 'payment_processing')
  const paid = orders.filter((o) => PAID_STATUSES.includes(o.status))

  const totalPaid = paid.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const totalPending = [...pendingPayment, ...paymentProcessing].reduce((sum, o) => sum + (o.total_amount || 0), 0)

  return {
    total_paid: totalPaid,
    total_pending: totalPending,
    orders_awaiting_payment: pendingPayment.length + paymentProcessing.length,
    orders_paid: paid.length,
    in_fulfillment: inFulfillment,
    pending_payment: pendingPayment,
    payment_processing: paymentProcessing,
    paid,
  }
}
