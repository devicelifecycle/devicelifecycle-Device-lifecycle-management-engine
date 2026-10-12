'use client'

import { useState, useEffect, useCallback } from 'react'
import { LogIn, LogOut, Download, Search, ChevronLeft, ChevronRight, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import type { AuditLog } from '@/types'

export default function LoginHistoryPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        entity_type: 'user',
      })
      if (actionFilter) {
        params.set('action', actionFilter)
      } else {
        params.set('action', 'login')
        params.append('action', 'logout')
      }
      if (search) params.set('search', search)

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
  }, [page, actionFilter, search])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams({
        entity_type: 'user',
        format: 'csv',
      })
      if (actionFilter) {
        params.set('action', actionFilter)
      } else {
        params.set('action', 'login')
      }

      const res = await fetch(`/api/admin/audit-log?${params}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `login-history-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Login history exported')
    } catch {
      toast.error('Failed to export login history')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Login History</h1>
          <p className="text-sm text-muted-foreground">
            Track user sign-ins and sign-outs across the platform
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="space-y-2 flex-1">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user name or email..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2 w-44">
              <Label>Event</Label>
              <Select value={actionFilter || 'all'} onValueChange={v => { setActionFilter(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger><SelectValue placeholder="All Events" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => { setActionFilter(''); setSearch(''); setPage(1) }}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Events ({total})
          </CardTitle>
          <CardDescription>Login and logout events recorded by the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mb-4" />
              <p>No login events recorded yet</p>
              <p className="text-sm mt-1">Login events will appear here once users sign in</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>User Agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDateTime(log.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge className={log.action === 'login'
                            ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }>
                            {log.action === 'login' ? (
                              <><LogIn className="mr-1 h-3 w-3" />Sign in</>
                            ) : (
                              <><LogOut className="mr-1 h-3 w-3" />Sign out</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.user?.email || log.user?.full_name || log.entity_id?.slice(0, 8) + '…'}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {log.ip_address || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate" title={log.user_agent || ''}>
                          {log.user_agent || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      Next<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
