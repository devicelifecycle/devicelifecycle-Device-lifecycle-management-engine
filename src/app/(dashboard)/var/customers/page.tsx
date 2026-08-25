'use client'

// ============================================================================
// VAR CUSTOMERS — the customer book for one VAR tenant
// ============================================================================
// Entity Admins see and manage every customer under their tenant; regional
// managers and reps get whatever GET /api/customers and the manage actions
// scope to them server-side (region / own) — this page just renders it.
// Single-record creation stays admin-only on POST /api/customers, so Import
// is the VAR's creation path (POST /api/customers/bulk allows tenant-level
// delegation). Route access is gated by the proxy's /var roleRoutes entry,
// same as the console page.

import { useEffect, useState } from 'react'
import {
  Ban, Download, Layers, Loader2, MapPin, MoreHorizontal, RotateCcw, Search, Upload, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { ComingSoon } from '@/components/ComingSoon'
import { useDebounce } from '@/hooks/useDebounce'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { parseTabularUpload } from '@/lib/csv-templates'

interface VarCustomer {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  region: string | null
  is_active: boolean
  plan_id: string | null
  created_at: string
}

interface PlanOption {
  id: string
  name: string
}

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

const MAX_IMPORT_ROWS = 1000 // server cap on POST /api/customers/bulk

export default function VarCustomersPage() {
  return <ComingSoon title="VAR Customers" />
}

function VarCustomersPageImpl() {
  const [customers, setCustomers] = useState<VarCustomer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  // The list API only distinguishes active vs suspended (an omitted is_active
  // resolves to active server-side), so there is no true "All" view here.
  const [status, setStatus] = useState<'active' | 'suspended'>('active')

  const [plans, setPlans] = useState<PlanOption[]>([])
  const [planTarget, setPlanTarget] = useState<VarCustomer | null>(null)
  const [moveTarget, setMoveTarget] = useState<VarCustomer | null>(null)
  const limit = 20

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams({
      search: debouncedSearch.trim(),
      is_active: status === 'suspended' ? 'false' : 'true',
      page: String(page),
      limit: String(limit),
    })
    fetch(`/api/customers?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: VarCustomer[]; total?: number } | null) => {
        if (!d) { setLoadFailed(true); return }
        setLoadFailed(false)
        setCustomers(d.data ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => toast.error('Could not load customers'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [debouncedSearch, status, page])

  useEffect(() => {
    fetch('/api/var/plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPlans(j?.data ?? []))
      .catch(() => {})
  }, [])

  const manage = async (customerId: string, body: Record<string, unknown>, successMsg: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/customers/${customerId}/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { toast.error(j?.error || 'Could not update customer'); return false }
      toast.success(successMsg)
      load()
      return true
    } catch {
      toast.error('Could not update customer')
      return false
    }
  }

  const planName = (planId: string | null): string =>
    planId ? plans.find((p) => p.id === planId)?.name ?? 'Unknown plan' : 'Inherited'

  const exportHref = `/api/customers/export${debouncedSearch.trim() ? `?search=${encodeURIComponent(debouncedSearch.trim())}` : ''}`
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Users className="h-6 w-6 text-primary" /> Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Companies under your organization — assign plans, suspend or reactivate accounts.</p>
        </div>
        <div className="flex gap-2">
          {/* The export route takes search only; it always lists active rows. */}
          <a href={exportHref}>
            <Button type="button" variant="outline"><Download className="mr-1 h-4 w-4" /> Export</Button>
          </a>
          <ImportCustomersDialog onImported={load} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer index</CardTitle>
          <CardDescription>{total} customer{total === 1 ? '' : 's'} in view.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search company, contact, or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v as 'active' | 'suspended'); setPage(1) }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : loadFailed ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Unable to load your customers.</div>
          ) : customers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No customers found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[56px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.company_name}</TableCell>
                        <TableCell>{c.contact_name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.contact_email}</TableCell>
                        <TableCell>{c.region || '—'}</TableCell>
                        <TableCell>
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[c.is_active ? 'active' : 'suspended']}`}>
                            {c.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </TableCell>
                        <TableCell>{planName(c.plan_id)}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {c.is_active ? (
                                <DropdownMenuItem onClick={() => manage(c.id, { action: 'suspend' }, `${c.company_name} suspended`)}>
                                  <Ban className="mr-2 h-4 w-4" /> Suspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => manage(c.id, { action: 'reactivate' }, `${c.company_name} reactivated`)}>
                                  <RotateCcw className="mr-2 h-4 w-4" /> Reactivate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setPlanTarget(c)}>
                                <Layers className="mr-2 h-4 w-4" /> Assign plan…
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setMoveTarget(c)}>
                                <MapPin className="mr-2 h-4 w-4" /> Move to region…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {planTarget && (
        <AssignPlanDialog customer={planTarget} plans={plans} onClose={() => setPlanTarget(null)} onSaved={load} />
      )}
      {moveTarget && (
        <MoveRegionDialog customer={moveTarget} onClose={() => setMoveTarget(null)} onSaved={load} />
      )}
    </div>
  )
}

function AssignPlanDialog({ customer, plans, onClose, onSaved }: {
  customer: VarCustomer
  plans: PlanOption[]
  onClose: () => void
  onSaved: () => void
}) {
  // '' sentinel = "Inherit tenant plan", sent to the API as a null override.
  const [planId, setPlanId] = useState(customer.plan_id ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_plan', planId: planId || null }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { toast.error(j?.error || 'Could not assign plan'); return }
      toast.success(planId ? `Plan assigned to ${customer.company_name}` : `${customer.company_name} now inherits the tenant plan`)
      onClose()
      onSaved()
    } catch {
      toast.error('Could not assign plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign plan</DialogTitle>
          <DialogDescription>{customer.company_name} — pick the subscription this account runs on.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">Plan</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Inherit tenant plan</SelectItem>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pb-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MoveRegionDialog({ customer, onClose, onSaved }: {
  customer: VarCustomer
  onClose: () => void
  onSaved: () => void
}) {
  const [region, setRegion] = useState(customer.region ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', region: region.trim() || null }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { toast.error(j?.error || 'Could not move customer'); return }
      toast.success(`${customer.company_name} moved`)
      onClose()
      onSaved()
    } catch {
      toast.error('Could not move customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to region</DialogTitle>
          <DialogDescription>{customer.company_name} — currently in {customer.region || 'no region'}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">Region</Label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Leave empty to clear" />
          <p className="text-[11px] text-muted-foreground">Regional managers can only move within their own scope.</p>
        </div>
        <div className="flex justify-end gap-2 pb-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Move
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// CSV IMPORT — same browser-parses flow as the device register importer; the
// server accepts JSON rows ({customers:[…]}) and enforces quota + duplicates.
// ============================================================================

interface ImportRow {
  company_name?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  payment_terms?: string
  notes?: string
  region?: string
}

const IMPORT_ALIASES: Record<string, string> = {
  company: 'company_name', 'company name': 'company_name',
  contact: 'contact_name', 'contact name': 'contact_name',
  email: 'contact_email', 'contact email': 'contact_email',
  phone: 'contact_phone', 'contact phone': 'contact_phone',
  'payment terms': 'payment_terms',
  notes: 'notes',
  region: 'region',
}

function ImportCustomersDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  type Stage = 'pick' | 'preview' | 'result'
  const [stage, setStage] = useState<Stage>('pick')
  const [preview, setPreview] = useState<Array<{ line: number; row: ImportRow; issue: string | null }> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; message?: string } | null>(null)

  const reset = () => { setStage('pick'); setPreview(null); setResult(null); setSubmitting(false); setParsing(false) }
  const close = (next: boolean) => { setOpen(next); if (!next) reset() }

  const handleFile = async (file: File) => {
    setParsing(true)
    try {
      const { rows } = await parseTabularUpload(file)
      const mapped = rows
        .map((raw) => {
          const record: Record<string, string> = {}
          for (const [key, value] of Object.entries(raw)) {
            const canonical = IMPORT_ALIASES[key.toLowerCase().trim()] ?? key.toLowerCase().trim()
            if (!record[canonical]) record[canonical] = String(value ?? '').trim()
          }
          return Object.values(record).some((v) => v !== '') ? record : null
        })
        .filter((r): r is Record<string, string> => r !== null)

      if (mapped.length === 0) { toast.error('No rows found in file'); return }
      if (mapped.length > MAX_IMPORT_ROWS) {
        toast.error(`Too many rows — the limit is ${MAX_IMPORT_ROWS} per import (file has ${mapped.length})`)
        return
      }

      const seenEmails = new Set<string>()
      const previewRows = mapped.map((record, i) => {
        const row: ImportRow = { company_name: record.company_name }
        if (record.contact_name) row.contact_name = record.contact_name
        if (record.contact_email) row.contact_email = record.contact_email
        if (record.contact_phone) row.contact_phone = record.contact_phone
        if (record.payment_terms) row.payment_terms = record.payment_terms
        if (record.notes) row.notes = record.notes
        if (record.region) row.region = record.region

        let issue: string | null = null
        const email = row.contact_email ?? ''
        if (!row.company_name || row.company_name.length < 2) issue = 'Company name is required (min 2 characters)'
        else if (!row.contact_name || row.contact_name.length < 2) issue = 'Contact name is required (min 2 characters)'
        else if (!/^\S+@\S+\.\S+$/.test(email)) issue = 'A valid contact email is required'
        else if (seenEmails.has(email.toLowerCase())) issue = `Duplicate email "${email}" within the file`
        else seenEmails.add(email.toLowerCase())

        return { line: i + 1, row, issue }
      })
      setPreview(previewRows)
      setStage('preview')
    } catch {
      toast.error('Could not read that file')
    } finally {
      setParsing(false)
    }
  }

  const submit = async () => {
    if (!preview || submitting) return
    const valid = preview.filter((r) => !r.issue).map((r) => r.row)
    if (valid.length === 0) { toast.error('No valid rows to import'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/customers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers: valid }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { toast.error(j?.error || 'Could not import customers'); return }
      setResult({ created: j.created ?? 0, skipped: j.skipped ?? 0, message: j.message })
      setStage('result')
      onImported()
    } catch {
      toast.error('Could not import customers')
    } finally {
      setSubmitting(false)
    }
  }

  const validCount = preview?.filter((r) => !r.issue).length ?? 0

  return (
    <Dialog open={open} onOpenChange={close}>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload className="mr-1 h-4 w-4" /> Import
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import customers</DialogTitle>
          <DialogDescription>
            Upload a CSV/Excel file with columns: company, contact, email, phone, payment terms, region, notes.
          </DialogDescription>
        </DialogHeader>

        {stage === 'pick' && (
          <div className="py-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground hover:bg-muted/40">
              {parsing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {parsing ? 'Reading file…' : 'Choose a .csv or .xlsx file'}
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
              />
            </label>
          </div>
        )}

        {stage === 'preview' && preview && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span>{validCount} valid row{validCount === 1 ? '' : 's'}, {preview.length - validCount} with issues</span>
              <Button type="button" variant="ghost" onClick={reset}>Pick another file</Button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto rounded-md border">
              {preview.map((r) => (
                <div key={r.line} className="border-b border-border/50 px-3 py-2 text-xs last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.row.company_name || '(missing name)'}</span>
                    <span className={r.issue ? 'text-destructive' : 'text-muted-foreground'}>{r.issue ?? r.row.contact_email}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
              <Button type="button" onClick={submit} disabled={submitting || validCount === 0}>
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Import {validCount} row{validCount === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}

        {stage === 'result' && result && (
          <div className="space-y-3 py-2 text-sm">
            <p>{result.created} customer{result.created === 1 ? '' : 's'} imported{result.skipped > 0 ? `, ${result.skipped} skipped (already exist)` : ''}.</p>
            {result.message && <p className="text-muted-foreground">{result.message}</p>}
            <div className="flex justify-end">
              <Button type="button" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}