// ============================================================================
// ADMIN - AUDIT LOG PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useOnDbChange } from '@/hooks/useOnDbChange'
import { FileText, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import type { AuditLog, AuditAction } from '@/types'

const actions: AuditAction[] = ['create', 'update', 'delete', 'status_change', 'login', 'logout', 'price_change', 'assignment']
const entityTypes = ['order', 'customer', 'vendor', 'device', 'user', 'pricing', 'sla_rule', 'shipment']

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  status_change: 'bg-purple-100 text-purple-700',
  login: 'bg-cyan-100 text-cyan-700',
  logout: 'bg-gray-100 text-gray-700',
  price_change: 'bg-yellow-100 text-yellow-700',
  assignment: 'bg-orange-100 text-orange-700',
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({
    action: '' as string,
    entity_type: '' as string,
    search: '',
  })

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '50' })
      if (filters.action) params.set('action', filters.action)
      if (filters.entity_type) params.set('entity_type', filters.entity_type)
      if (filters.search) params.set('search', filters.search)

      const res = await fetch(`/api/admin/audit-log?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.data || [])
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [page, filters])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useOnDbChange(fetchLogs)

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.action) params.set('action', filters.action)
      if (filters.entity_type) params.set('entity_type', filters.entity_type)
      params.set('format', 'csv')

      const res = await fetch(`/api/admin/audit-log?${params}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Audit log exported')
    } catch {
      toast.error('Failed to export audit log')
    }
  }

  const resetFilters = () => {
    setFilters({ action: '', entity_type: '', search: '' })
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground">View system activity and change history</p>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="space-y-2 flex-1">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by entity ID or user..."
                  value={filters.search}
                  onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2 w-44">
              <Label>Action</Label>
              <Select value={filters.action || 'all'} onValueChange={v => { setFilters(f => ({ ...f, action: v === 'all' ? '' : v })); setPage(1) }}>
                <SelectTrigger><SelectValue placeholder="All Actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actions.map(a => (
                    <SelectItem key={a} value={a}>{a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 w-44">
              <Label>Entity Type</Label>
              <Select value={filters.entity_type || 'all'} onValueChange={v => { setFilters(f => ({ ...f, entity_type: v === 'all' ? '' : v })); setPage(1) }}>
                <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {entityTypes.map(t => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={resetFilters}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4" />
              <p>No audit events found</p>
              {(filters.action || filters.entity_type || filters.search) && (
                <Button variant="link" onClick={resetFilters} className="mt-2">Clear filters</Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.user?.full_name || log.user_id?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <Badge variant="outline" className="text-xs">
                            {log.entity_type}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {log.entity_id?.slice(0, 8)}...
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {log.action === 'status_change' && log.old_values && log.new_values ? (
                          <span className="text-sm">
                            {String(log.old_values.status || '')} → {String(log.new_values.status || '')}
                          </span>
                        ) : log.new_values ? (
                          <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
                            {Object.keys(log.new_values).join(', ')}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.ip_address || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({total} total events)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" />Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next<ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
