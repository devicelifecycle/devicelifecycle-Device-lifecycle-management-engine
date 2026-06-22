'use client'

import { useQuery } from '@tanstack/react-query'
import { DollarSign, Clock, CheckCircle2, Truck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageHero } from '@/components/ui/page-hero'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import type { OrderStatus } from '@/types'

interface VendorPayoutOrder {
  id: string
  order_number: string
  status: OrderStatus
  total_amount: number
  total_quantity: number
  payment_method: string | null
  payment_reference: string | null
  payment_processed_at: string | null
  updated_at: string
}

interface VendorPayoutsResponse {
  total_paid: number
  total_pending: number
  orders_awaiting_payment: number
  orders_paid: number
  in_fulfillment: VendorPayoutOrder[]
  pending_payment: VendorPayoutOrder[]
  payment_processing: VendorPayoutOrder[]
  paid: VendorPayoutOrder[]
}

async function fetchMyPayouts(): Promise<VendorPayoutsResponse> {
  const res = await fetch('/api/vendors/me/payouts')
  if (!res.ok) throw new Error('Failed to fetch payouts')
  return res.json()
}

function PayoutTable({ orders, emptyLabel }: { orders: VendorPayoutOrder[]; emptyLabel: string }) {
  if (orders.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium whitespace-nowrap">{order.order_number}</TableCell>
              <TableCell className="whitespace-nowrap">
                <Badge variant="secondary" className="text-[11px]">
                  {ORDER_STATUS_CONFIG[order.status]?.label || order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{order.total_quantity}</TableCell>
              <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">
                {formatCurrency(order.total_amount || 0)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatRelativeTime(order.updated_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function VendorPayoutsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['vendor-my-payouts'],
    queryFn: fetchMyPayouts,
    staleTime: 30_000,
  })

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Vendor Workspace"
        title="Track what you've been paid, and what's still in the pipeline."
        description="Every sourcing order you've fulfilled, grouped by where it sits in the payment process."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Paid', value: data ? formatCurrency(data.total_paid) : '—', icon: CheckCircle2, tone: 'text-emerald-400' },
          { label: 'Pending Payout', value: data ? formatCurrency(data.total_pending) : '—', icon: DollarSign, tone: 'text-teal-400' },
          { label: 'Orders Awaiting Payment', value: data?.orders_awaiting_payment ?? '—', icon: Clock, tone: 'text-amber-400' },
          { label: 'Orders Paid', value: data?.orders_paid ?? '—', icon: Truck, tone: 'text-blue-400' },
        ].map((stat) => (
          <Card key={stat.label} className="metric-tile">
            <CardContent className="p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                  <div className="mt-3 text-3xl font-semibold text-foreground">
                    {isLoading ? '—' : stat.value}
                  </div>
                </div>
                <div className={stat.tone}><stat.icon className="h-6 w-6" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Payment Processing</CardTitle>
          <CardDescription>QC complete and approved — payment has been initiated.</CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutTable orders={data?.payment_processing ?? []} emptyLabel="No orders currently in payment processing." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fulfilled — Awaiting Payment</CardTitle>
          <CardDescription>QC complete, payment not yet started.</CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutTable orders={data?.pending_payment ?? []} emptyLabel="No fulfilled orders awaiting payment." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paid</CardTitle>
          <CardDescription>Payment has been sent for these orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutTable orders={data?.paid ?? []} emptyLabel="No paid orders yet." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>In Fulfillment</CardTitle>
          <CardDescription>Still being sourced or shipped — not yet eligible for payment.</CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutTable orders={data?.in_fulfillment ?? []} emptyLabel="Nothing currently in fulfillment." />
        </CardContent>
      </Card>
    </div>
  )
}
