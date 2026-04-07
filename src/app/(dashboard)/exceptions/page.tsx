// ============================================================================
// EXCEPTIONS DASHBOARD PAGE
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, XCircle, Filter, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/utils'

const SEVERITY_COLORS: Record<string, string> = {
  major: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  minor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  coe_approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  admin_approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

interface Exception {
  id: string
  order_id: string
  severity: string
  approval_status: string
  summary: string
  created_at: string
  order?: {
    id: string
    order_number: string
  }
}

export default function ExceptionsDashboard() {
  const { user } = useAuth()
  const isCOE = user?.role === 'coe_manager' || user?.role === 'coe_tech'
  const isAdmin = user?.role === 'admin'
  
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('pending')

  // Fetch pending exceptions
  const fetchExceptions = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const params = new URLSearchParams()
      if (severityFilter !== 'all') params.append('severity', severityFilter)
      if (statusFilter !== 'all') params.append('status', statusFilter)

      const res = await fetch(`/api/exceptions?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch exceptions')
      const data = await res.json()
      setExceptions(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load exceptions')
      setExceptions([])
    } finally {
      if (isRefresh) setIsRefreshing(false)
      else setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchExceptions()
  }, [severityFilter, statusFilter])

  const hasPendingApprovals = exceptions.some(
    (e) => e.approval_status === 'pending' || (isCOE && e.approval_status === 'coe_approved' && isAdmin === false)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
            Exception Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            {exceptions.length} exception{exceptions.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchExceptions(true)}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Severity</label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="coe_approved">COE Approved</SelectItem>
                  <SelectItem value="admin_approved">Admin Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert for pending items */}
      {hasPendingApprovals && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              You have pending approvals that need attention
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300/90 mt-1">
              Review exceptions below and approve or reject as needed. Orders cannot proceed until all exceptions are resolved.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Exceptions Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : exceptions.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              {statusFilter === 'pending'
                ? 'No pending exceptions'
                : 'No exceptions match your filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Exceptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map((exc) => (
                    <TableRow key={exc.id}>
                      <TableCell className="font-medium">
                        {exc.order?.order_number || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs">
                        {exc.summary}
                      </TableCell>
                      <TableCell>
                        <Badge className={SEVERITY_COLORS[exc.severity] || ''}>
                          {exc.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[exc.approval_status] || ''}>
                          {exc.approval_status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(exc.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/orders/${exc.order_id}?tab=discrepancies`}>
                          <Button size="sm" variant="outline">
                            Review
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
