// ============================================================================
// DISCREPANCY DETAIL COMPONENT - Shows exceptions for an order
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, FileDown, Loader2, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import type { OrderDiscrepancyResponse } from '@/types'

interface DiscrepancyDetailProps {
  orderId: string
}

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ReactNode; badge: string }> = {
  major: {
    color: 'text-red-600 dark:text-red-400',
    icon: <AlertTriangle className="h-4 w-4" />,
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  moderate: {
    color: 'text-yellow-600 dark:text-yellow-400',
    icon: <AlertTriangle className="h-4 w-4" />,
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
  minor: {
    color: 'text-blue-600 dark:text-blue-400',
    icon: <AlertTriangle className="h-4 w-4" />,
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: {
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  coe_approved: {
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  admin_approved: {
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  rejected: {
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: <XCircle className="h-4 w-4" />,
  },
}

export function DiscrepancyDetail({ orderId }: DiscrepancyDetailProps) {
  const { user } = useAuth()
  const isCOE = user?.role === 'coe_manager' || user?.role === 'coe_tech'
  const isAdmin = user?.role === 'admin'
  
  const [data, setData] = useState<OrderDiscrepancyResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [approvalDialog, setApprovalDialog] = useState<{ exceptionId: string; type: 'coe' | 'admin' } | null>(null)
  const [rejectDialog, setRejectDialog] = useState<{ exceptionId: string } | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch discrepancies
  useEffect(() => {
    const fetchDiscrepancies = async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`/api/orders/${orderId}/discrepancies`)
        if (!res.ok) throw new Error('Failed to fetch discrepancies')
        const result = await res.json()
        setData(result)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load discrepancies')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDiscrepancies()
  }, [orderId])

  const handleApproveCOE = async () => {
    if (!approvalDialog) return
    setIsProcessing(true)
    try {
      const res = await fetch(
        `/api/orders/${orderId}/discrepancies/${approvalDialog.exceptionId}/approve-coe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: approvalNotes }),
        }
      )
      if (!res.ok) throw new Error('Failed to approve exception')
      toast.success('Exception approved by COE')
      setApprovalDialog(null)
      setApprovalNotes('')
      // Refetch
      const updateRes = await fetch(`/api/orders/${orderId}/discrepancies`)
      const updated = await updateRes.json()
      setData(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApproveAdmin = async () => {
    if (!approvalDialog) return
    setIsProcessing(true)
    try {
      const res = await fetch(
        `/api/orders/${orderId}/discrepancies/${approvalDialog.exceptionId}/approve-admin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: approvalNotes }),
        }
      )
      if (!res.ok) throw new Error('Failed to approve exception')
      toast.success('Exception approved by Admin')
      setApprovalDialog(null)
      setApprovalNotes('')
      // Refetch
      const updateRes = await fetch(`/api/orders/${orderId}/discrepancies`)
      const updated = await updateRes.json()
      setData(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectDialog || !rejectionReason.trim()) {
      toast.error('Rejection reason required')
      return
    }
    setIsProcessing(true)
    try {
      const res = await fetch(
        `/api/orders/${orderId}/discrepancies/${rejectDialog.exceptionId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectionReason }),
        }
      )
      if (!res.ok) throw new Error('Failed to reject exception')
      toast.success('Exception rejected')
      setRejectDialog(null)
      setRejectionReason('')
      // Refetch
      const updateRes = await fetch(`/api/orders/${orderId}/discrepancies`)
      const updated = await updateRes.json()
      setData(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!data || data.exceptions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Discrepancies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No discrepancies found. All items match claimed conditions.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Discrepancies
              </CardTitle>
              <CardDescription>
                {data.itemsWithDiscrepancies} of {data.totalItems} items ({data.discrepancyRate})
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{data.totalItems} items</Badge>
              <Badge variant="secondary">{data.discrepancyRate}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary Stats */}
          <div className="grid gap-2 sm:grid-cols-2 mb-6 pb-6 border-b">
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 p-3">
              <p className="text-xs font-medium text-yellow-900 dark:text-yellow-300">Pending Review</p>
              <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-200">
                {data.summaryByStatus.pending}
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3">
              <p className="text-xs font-medium text-blue-900 dark:text-blue-300">COE Approved</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-200">
                {data.summaryByStatus.coe_approved}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-3">
              <p className="text-xs font-medium text-green-900 dark:text-green-300">Admin Approved</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-200">
                {data.summaryByStatus.admin_approved}
              </p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs font-medium text-red-900 dark:text-red-300">Rejected</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-200">
                {data.summaryByStatus.rejected}
              </p>
            </div>
          </div>

          {/* Exception Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.exceptions.map((exc) => (
                  <TableRow key={exc.exceptionId}>
                    <TableCell className="font-medium text-sm">{exc.deviceName}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-red-600">
                        {exc.claimedCondition ? (
                          <>
                            {exc.claimedCondition}
                            {exc.actualCondition && (
                              <>
                                {' '}
                                <span className="text-muted-foreground">→</span> {exc.actualCondition}
                              </>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={SEVERITY_CONFIG[exc.severity].badge}>
                        {exc.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CONFIG[exc.approvalStatus].color}>
                        {exc.approvalStatus.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {exc.approvalStatus === 'pending' && isCOE && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setApprovalDialog({ exceptionId: exc.exceptionId, type: 'coe' })}
                        >
                          Approve (COE)
                        </Button>
                      )}
                      {exc.approvalStatus === 'coe_approved' && isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setApprovalDialog({ exceptionId: exc.exceptionId, type: 'admin' })}
                        >
                          Approve (Admin)
                        </Button>
                      )}
                      {['pending', 'coe_approved'].includes(exc.approvalStatus) && (isCOE || isAdmin) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setRejectDialog({ exceptionId: exc.exceptionId })}
                        >
                          Reject
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Approval Dialog */}
      <Dialog open={!!approvalDialog} onOpenChange={() => approvalDialog && setApprovalDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalDialog?.type === 'coe' ? 'COE Approval' : 'Admin Approval'}
            </DialogTitle>
            <DialogDescription>
              {approvalDialog?.type === 'coe'
                ? 'Confirm condition findings for this exception'
                : 'Approve pricing adjustment for this exception'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="approval-notes">Notes (optional)</Label>
              <Textarea
                id="approval-notes"
                placeholder="Add approval notes..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApprovalDialog(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={
                approvalDialog?.type === 'coe'
                  ? handleApproveCOE
                  : handleApproveAdmin
              }
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => rejectDialog && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Exception</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this exception. The order cannot proceed until resolved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="rejection-reason">Rejection Reason *</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Explain why this exception is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isProcessing || !rejectionReason.trim()}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
