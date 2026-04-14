'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowRightLeft, CheckCircle2, Download, FileUp, Loader2, Plus, Search, ShoppingCart, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { OrderStatus, OrderType } from '@/types'

export default function OrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [typeFilter, setTypeFilter] = useState<OrderType | ''>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | ''>('')
  const debouncedSearch = useDebounce(search)
  const { hasRole } = useAuth()

  const isAdmin = hasRole(['admin'])
  const isInternal = hasRole(['admin', 'coe_manager', 'coe_tech', 'sales'])
  const isCustomer = hasRole(['customer'])
  const canCreateTradeIn = isInternal || isCustomer
  const canCreateCpo = hasRole(['admin', 'coe_manager', 'coe_tech'])
  const canBulkTransition = isInternal
  const canImport = isInternal

  // ── Import dialog state ─────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false)
  const [importStep, setImportStep] = useState<1 | 2>(1)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importOrderType, setImportOrderType] = useState<'trade_in' | 'cpo'>('trade_in')
  const [importCustomerSearch, setImportCustomerSearch] = useState('')
  const [importCustomerId, setImportCustomerId] = useState<string | null>(null)
  const [importCustomerName, setImportCustomerName] = useState('')
  const [importCustomerResults, setImportCustomerResults] = useState<Array<{ id: string; company_name: string }>>([])
  const [importCustomerLoading, setImportCustomerLoading] = useState(false)
  const [importParsing, setImportParsing] = useState(false)
  const [importParseError, setImportParseError] = useState('')
  type ImportRow = { make: string; model: string; storage: string; condition: string; quantity: number; unit_price: number | null; serials: string[]; imeis: string[]; device_id: string | null; match_status: string }
  type ImportSummary = { total_devices: number; matched: number; unmatched: number; total_value: number | null; format_type: string; llm_assisted: boolean; sheet_parsed?: string }
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importAvailableSheets, setImportAvailableSheets] = useState<string[]>([])
  const [importSelectedSheet, setImportSelectedSheet] = useState<string>('')
  const [importRowEdits, setImportRowEdits] = useState<Record<number, { condition?: string; quantity?: string; unit_price?: string }>>({})
  const [importCreating, setImportCreating] = useState(false)
  const debouncedCustomerSearch = useDebounce(importCustomerSearch, 300)

  const customerIdFromUrl = searchParams.get('customer_id') || undefined
  const vendorIdFromUrl = searchParams.get('vendor_id') || undefined

  useEffect(() => {
    if (isCustomer) router.replace('/customer/orders')
  }, [isCustomer, router])

  useEffect(() => {
    const statusFromUrl = searchParams.get('status')
    const typeFromUrl = searchParams.get('type')

    if (statusFromUrl && statusFromUrl in ORDER_STATUS_CONFIG) {
      setStatusFilter(statusFromUrl as OrderStatus)
    }
    if (typeFromUrl === 'trade_in' || typeFromUrl === 'cpo') {
      setTypeFilter(typeFromUrl as OrderType)
    }
  }, [searchParams])

  const {
    orders,
    isLoading,
    total,
    totalPages,
    bulkTransition,
    isBulkTransitioning,
    bulkDelete,
    isBulkDeleting,
  } = useOrders({
    search: debouncedSearch,
    page,
    ...(statusFilter && { status: statusFilter }),
    ...(typeFilter && { type: typeFilter }),
    ...(customerIdFromUrl && { customer_id: customerIdFromUrl }),
    ...(vendorIdFromUrl && { vendor_id: vendorIdFromUrl }),
  })

  const hasFilters = statusFilter || typeFilter || customerIdFromUrl || vendorIdFromUrl
  const allSelected = orders.length > 0 && orders.every((order) => selectedIds.has(order.id))
  const someSelected = selectedIds.size > 0
  const deletableSelectedCount = orders.filter((order) => selectedIds.has(order.id) && ['draft', 'cancelled'].includes(order.status)).length

  const stats = useMemo(() => {
    const active = orders.filter((order) => ['submitted', 'quoted', 'sourcing', 'received', 'in_triage'].includes(order.status)).length
    const delivered = orders.filter((order) => ['delivered', 'closed'].includes(order.status)).length
    const totalValue = orders.reduce((sum, order) => sum + (order.quoted_amount ?? order.total_amount ?? 0), 0)
    return { active, delivered, totalValue }
  }, [orders])

  // Customer search for import dialog
  useEffect(() => {
    const q = debouncedCustomerSearch.trim()
    if (!q || importCustomerId) { setImportCustomerResults([]); return }
    setImportCustomerLoading(true)
    fetch(`/api/customers?search=${encodeURIComponent(q)}&page_size=8`)
      .then(r => r.json())
      .then(d => setImportCustomerResults((d.data || []).map((c: { id: string; company_name: string }) => ({ id: c.id, company_name: c.company_name }))))
      .catch(() => setImportCustomerResults([]))
      .finally(() => setImportCustomerLoading(false))
  }, [debouncedCustomerSearch, importCustomerId])

  function resetImportDialog() {
    setImportStep(1)
    setImportFile(null)
    setImportOrderType('trade_in')
    setImportCustomerSearch('')
    setImportCustomerId(null)
    setImportCustomerName('')
    setImportCustomerResults([])
    setImportParsing(false)
    setImportParseError('')
    setImportRows([])
    setImportSummary(null)
    setImportRowEdits({})
    setImportAvailableSheets([])
    setImportSelectedSheet('')
  }

  async function handleParseImportFile(sheetOverride?: string) {
    if (!importFile) return
    setImportParsing(true)
    setImportParseError('')
    try {
      const form = new FormData()
      form.append('file', importFile)
      const sheet = sheetOverride ?? importSelectedSheet
      const url = sheet ? `/api/orders/parse-trade-template?sheet=${encodeURIComponent(sheet)}` : '/api/orders/parse-trade-template'
      const res = await fetch(url, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Parse failed')
      // Capture available sheets on first parse so user can switch
      if (data.available_sheets?.length > 1) {
        setImportAvailableSheets(data.available_sheets)
        if (!importSelectedSheet) setImportSelectedSheet(data.summary?.sheet_parsed || data.available_sheets[0])
      }
      setImportRows(data.rows || [])
      setImportSummary(data.summary || null)
      setImportRowEdits({})
      setImportStep(2)
    } catch (err) {
      setImportParseError(err instanceof Error ? err.message : 'Failed to parse file')
    } finally {
      setImportParsing(false)
    }
  }

  async function handleCreateFromImport() {
    if (!importCustomerId) { toast.error('Select a customer first'); return }
    const rows = importRows.map((r, idx) => {
      const edit = importRowEdits[idx] || {}
      return {
        ...r,
        condition: edit.condition ?? r.condition,
        quantity: edit.quantity ? (parseInt(edit.quantity, 10) || r.quantity) : r.quantity,
        unit_price: edit.unit_price !== undefined ? (parseFloat(edit.unit_price) || r.unit_price) : r.unit_price,
      }
    }).filter(r => r.device_id)
    if (rows.length === 0) { toast.error('No catalog-matched rows to create order from'); return }
    setImportCreating(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: importOrderType,
          customer_id: importCustomerId,
          items: rows.map(r => ({
            device_id: r.device_id,
            quantity: r.quantity,
            storage: r.storage,
            condition: r.condition,
            notes: r.serials.length > 0 ? `Serials: ${r.serials.join(', ')}` : r.imeis.length > 0 ? `IMEIs: ${r.imeis.join(', ')}` : undefined,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order creation failed')
      toast.success(`Draft order ${data.data?.order_number || ''} created`)
      setImportOpen(false)
      resetImportDialog()
      if (data.data?.id) router.push(`/orders/${data.data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setImportCreating(false)
    }
  }

  function clearFilters() {
    setStatusFilter('')
    setTypeFilter('')
    setPage(1)
    if (customerIdFromUrl || vendorIdFromUrl) router.replace('/orders')
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(orders.map((order) => order.id)))
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkTransition() {
    if (!bulkStatus || selectedIds.size === 0) return
    try {
      const result = await bulkTransition({ orderIds: Array.from(selectedIds), toStatus: bulkStatus as OrderStatus })
      toast.success(`${result.succeeded} order(s) updated${result.failed > 0 ? `, ${result.failed} failed` : ''}`)
      setSelectedIds(new Set())
      setBulkStatus('')
    } catch {
      toast.error('Bulk transition failed')
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    const deletableIds = orders
      .filter((order) => selectedIds.has(order.id) && ['draft', 'cancelled'].includes(order.status))
      .map((order) => order.id)
    if (deletableIds.length === 0) {
      toast.error('Only draft or cancelled orders can be deleted.')
      return
    }
    try {
      const result = await bulkDelete(deletableIds)
      const skipped = selectedIds.size - deletableIds.length
      if (result.succeeded > 0) {
        toast.success(`${result.succeeded} order(s) deleted${skipped > 0 ? `, ${skipped} skipped` : ''}`)
      }
      if (result.failed > 0) {
        const firstError = result.results?.find((row) => !row.success && row.error)?.error
        toast.error(`${result.failed} order(s) could not be deleted${firstError ? `: ${firstError}` : ''}`)
      }
      setSelectedIds(new Set())
    } catch {
      toast.error('Bulk delete failed')
    }
  }

  function handleExportCSV() {
    const selected = orders.filter((order) => selectedIds.has(order.id))
    const rows = [
      ['Order #', 'Type', 'Customer/Vendor', 'Status', 'Qty', 'Amount', 'Created'].join(','),
      ...selected.map((order) =>
        [
          order.order_number,
          order.type === 'trade_in' ? 'Trade-In' : 'CPO',
          `"${(order.type === 'trade_in' ? order.customer?.company_name : order.vendor?.company_name) || ''}"`,
          order.status,
          order.total_quantity,
          order.total_amount || 0,
          order.created_at,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${selected.length} order(s)`)
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Order Operations"
        title="Move trade-in and CPO work through one visible queue."
        description={
          isInternal
            ? 'Search, filter, bulk-transition, and track operational throughput without losing context between teams.'
            : 'Track the orders relevant to your role and keep momentum visible.'
        }
        actions={
          <>
            {canImport && (
              <Button variant="outline" onClick={() => { resetImportDialog(); setImportOpen(true) }}>
                <FileUp className="mr-2 h-4 w-4" />
                Import Customer Quote
              </Button>
            )}
            {canCreateCpo && (
              <Link href="/orders/new">
                <Button variant="secondary">
                  <Upload className="mr-2 h-4 w-4" />
                  CSV / Mixed Order
                </Button>
              </Link>
            )}
            {canCreateTradeIn && (
              <Link href="/orders/new/trade-in">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Trade-In
                </Button>
              </Link>
            )}
            {canCreateCpo && (
              <Link href="/orders/new/cpo">
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  New CPO
                </Button>
              </Link>
            )}
          </>
        }
        stats={[
          { label: 'Visible orders', value: total },
          { label: 'Active queue', value: stats.active },
          { label: 'Closed / delivered', value: stats.delivered },
          { label: 'Visible value', value: formatCurrency(stats.totalValue) },
        ]}
      />

      {organizationIdBanner({
        customerIdFromUrl,
        vendorIdFromUrl,
        clearFilters,
      })}

      <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl text-stone-100">Filters and controls</CardTitle>
              <CardDescription className="mt-2 text-stone-400">
                Search the queue, narrow by status or type, and prepare bulk actions.
              </CardDescription>
            </div>
            {hasFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
              <Input
                placeholder="Search by order number, IMEI, or serial number..."
                className="pl-11"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(value) => { setStatusFilter(value === 'all' ? '' : (value as OrderStatus)); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(ORDER_STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter || 'all'} onValueChange={(value) => { setTypeFilter(value === 'all' ? '' : (value as OrderType)); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="trade_in">Trade-In</SelectItem>
                <SelectItem value="cpo">CPO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence>
            {someSelected && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">{selectedIds.size} selected</Badge>

                  {canBulkTransition && (
                    <>
                      <Select value={bulkStatus || 'pick'} onValueChange={(value) => setBulkStatus(value === 'pick' ? '' : (value as OrderStatus))}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Move to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pick">Move to...</SelectItem>
                          {Object.entries(ORDER_STATUS_CONFIG).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" disabled={!bulkStatus || isBulkTransitioning} onClick={handleBulkTransition}>
                        <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                        {isBulkTransitioning ? 'Updating...' : 'Apply'}
                      </Button>
                    </>
                  )}

                  <Button size="sm" variant="outline" onClick={handleExportCSV}>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Export CSV
                  </Button>

                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isBulkDeleting || deletableSelectedCount === 0}
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {isBulkDeleting ? 'Deleting...' : 'Delete'}
                    </Button>
                  )}

                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    Clear selection
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl text-stone-100">Order index</CardTitle>
            <CardDescription className="mt-2 text-stone-400">{total} total orders in the current view.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-16 rounded-[1rem] bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
              <ShoppingCart className="mx-auto h-10 w-10 text-stone-600" />
              <p className="mt-4 text-lg font-semibold text-stone-200">No orders match this view.</p>
              <p className="mt-2 text-sm text-stone-500">
                {canCreateTradeIn ? 'Create an order or relax the filters to bring the queue back into view.' : 'Orders will appear here when work is assigned.'}
              </p>
              {canCreateTradeIn && (
                <Link href="/orders/new/trade-in">
                  <Button className="mt-5">Create order</Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Customer / Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const statusConfig = ORDER_STATUS_CONFIG[order.status]
                    const isSelected = selectedIds.has(order.id)
                    return (
                      <TableRow key={order.id} data-state={isSelected ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(order.id)} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                              {order.order_number}
                            </Link>
                            {(order.unresolved_discrepancy_count || 0) > 0 && (
                              <Badge variant="destructive" className="h-5 px-2 text-[10px] uppercase tracking-wide">
                                {order.unresolved_discrepancy_count} exception{order.unresolved_discrepancy_count === 1 ? '' : 's'}
                              </Badge>
                            )}
                            {(order.unresolved_discrepancy_count || 0) === 0 && (order.discrepancy_count || 0) > 0 && (
                              <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase tracking-wide">
                                resolved
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.type === 'trade_in' ? 'Trade-In' : 'CPO'}</Badge>
                        </TableCell>
                        <TableCell className="text-stone-300 whitespace-nowrap">
                          {order.type === 'trade_in' ? order.customer?.company_name : order.vendor?.company_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={order.status} label={statusConfig?.label} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{order.total_quantity}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">
                          {formatCurrency(order.total_amount || 0)}
                        </TableCell>
                        <TableCell className="text-stone-400 whitespace-nowrap">{formatRelativeTime(order.created_at)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Import Customer Quote Dialog ─────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={open => { if (!open) { setImportOpen(false); resetImportDialog() } else setImportOpen(true) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {importStep === 1 ? 'Import Customer Quote' : 'Review Parsed Devices'}
            </DialogTitle>
            <DialogDescription>
              {importStep === 1
                ? 'Upload any customer trade-in spreadsheet — Excel or CSV. We\'ll normalise columns and match devices to the catalog automatically.'
                : importSummary
                  ? `${importSummary.total_devices} devices · ${importSummary.matched} matched · ${importSummary.format_type}${importSummary.sheet_parsed ? ` · Sheet: ${importSummary.sheet_parsed}` : ''}${importSummary.llm_assisted ? ' · AI-assisted' : ''}${importSummary.total_value != null ? ` · Total: ${formatCurrency(importSummary.total_value)}` : ''}`
                  : ''}
            </DialogDescription>
          </DialogHeader>

          {importStep === 1 && (
            <div className="space-y-4 py-2">
              {/* File picker */}
              <div className="space-y-1.5">
                <Label>Customer spreadsheet</Label>
                <div
                  className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted px-6 py-8 cursor-pointer hover:border-primary/60 transition-colors"
                  onClick={() => document.getElementById('import-file-input')?.click()}
                >
                  <FileUp className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {importFile ? importFile.name : 'Click to browse or drop an Excel / CSV file'}
                  </p>
                  {importFile && <p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(1)} KB</p>}
                  <input
                    id="import-file-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setImportFile(f); e.target.value = '' }}
                  />
                </div>
              </div>

              {/* Order type */}
              <div className="space-y-1.5">
                <Label>Order type</Label>
                <Select value={importOrderType} onValueChange={v => setImportOrderType(v as 'trade_in' | 'cpo')}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trade_in">Trade-In</SelectItem>
                    <SelectItem value="cpo">CPO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Customer search */}
              <div className="space-y-1.5">
                <Label>Customer</Label>
                {importCustomerId ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">{importCustomerName}</div>
                    <Button variant="ghost" size="sm" onClick={() => { setImportCustomerId(null); setImportCustomerName(''); setImportCustomerSearch('') }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search by company name…"
                      value={importCustomerSearch}
                      onChange={e => setImportCustomerSearch(e.target.value)}
                    />
                    {importCustomerLoading && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                    {importCustomerResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                        {importCustomerResults.map(c => (
                          <button key={c.id} className="w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setImportCustomerId(c.id); setImportCustomerName(c.company_name); setImportCustomerResults([]) }}>
                            {c.company_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {importParseError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />{importParseError}
                </p>
              )}
            </div>
          )}

          {importStep === 2 && (
            <div className="space-y-3 py-2">
              {/* Sheet picker — shown when workbook has multiple sheets */}
              {importAvailableSheets.length > 1 && (
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 text-xs text-muted-foreground">Sheet:</Label>
                  <Select
                    value={importSelectedSheet}
                    onValueChange={async (sheet) => {
                      setImportSelectedSheet(sheet)
                      await handleParseImportFile(sheet)
                    }}
                  >
                    <SelectTrigger className="h-7 w-48 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {importAvailableSheets.map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {importParsing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              )}
              {importSummary && importSummary.unmatched > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {importSummary.unmatched} SKU{importSummary.unmatched !== 1 ? 's' : ''} not found in catalog — these rows will be skipped when creating the order. You can still submit; they will be excluded.
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.map((row, idx) => {
                    const edit = importRowEdits[idx] || {}
                    const isMatched = row.match_status === 'matched'
                    return (
                      <TableRow key={idx} className={!isMatched ? 'opacity-50' : ''}>
                        <TableCell className="text-sm font-medium">
                          {row.make} {row.model}
                          {row.serials.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({row.serials.length} serials)</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.storage || '—'}</TableCell>
                        <TableCell>
                          <Select value={edit.condition ?? row.condition} onValueChange={v => setImportRowEdits(prev => ({ ...prev, [idx]: { ...prev[idx], condition: v } }))}>
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['new', 'excellent', 'good', 'fair', 'poor'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number" min="1"
                            value={edit.quantity ?? String(row.quantity)}
                            onChange={e => setImportRowEdits(prev => ({ ...prev, [idx]: { ...prev[idx], quantity: e.target.value } }))}
                            className="h-7 w-16 text-center text-xs"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder={row.unit_price != null ? String(row.unit_price) : '—'}
                            value={edit.unit_price ?? (row.unit_price != null ? String(row.unit_price) : '')}
                            onChange={e => setImportRowEdits(prev => ({ ...prev, [idx]: { ...prev[idx], unit_price: e.target.value } }))}
                            className="h-7 w-24 text-right text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          {isMatched ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />Matched
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <AlertCircle className="h-3.5 w-3.5" />Not in catalog
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter className="gap-2">
            {importStep === 1 && (
              <>
                <Button variant="ghost" onClick={() => { setImportOpen(false); resetImportDialog() }}>Cancel</Button>
                <Button onClick={() => handleParseImportFile()} disabled={!importFile || importParsing}>
                  {importParsing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {importParsing ? 'Parsing…' : 'Parse File'}
                </Button>
              </>
            )}
            {importStep === 2 && (
              <>
                <Button variant="ghost" onClick={() => setImportStep(1)}>← Back</Button>
                <Button onClick={handleCreateFromImport} disabled={importCreating || !importCustomerId || importRows.filter(r => r.device_id).length === 0}>
                  {importCreating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Create Draft Order ({importRows.filter(r => r.device_id).length} SKUs)
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function organizationIdBanner({
  customerIdFromUrl,
  vendorIdFromUrl,
  clearFilters,
}: {
  customerIdFromUrl?: string
  vendorIdFromUrl?: string
  clearFilters: () => void
}) {
  if (!customerIdFromUrl && !vendorIdFromUrl) return null

  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.04] px-5 py-4 text-sm text-stone-300">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-stone-500">Scoped view active.</span>
        {customerIdFromUrl ? <span>Showing orders for a selected customer.</span> : null}
        {vendorIdFromUrl ? <span>Showing orders for a selected vendor.</span> : null}
        <button className="ml-auto text-primary hover:text-primary/70" onClick={clearFilters}>
          Clear scope
        </button>
      </div>
    </div>
  )
}
