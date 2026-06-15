'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers } from '@/hooks/useCustomers'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Customer } from '@/types'

type EditForm = {
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  payment_terms: string
  notes: string
  default_risk_mode: 'retail' | 'enterprise' | ''
}

const emptyEditForm = (): EditForm => ({
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  payment_terms: '',
  notes: '',
  default_risk_mode: '',
})

export default function CustomersPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm())
  const [isSaving, setIsSaving] = useState(false)
  const debouncedSearch = useDebounce(search)
  const organizationId = searchParams.get('organization_id') || undefined

  const { customers, total, isLoading, error, totalPages, remove, isDeleting, refetch } = useCustomers({
    search: debouncedSearch,
    page,
    organization_id: organizationId,
  })

  const canDelete = user?.role === 'admin' || user?.role === 'coe_manager'
  const canCreate = user?.role === 'admin' || user?.role === 'coe_manager'
  const canEdit = user?.role === 'admin' || user?.role === 'coe_manager' || user?.role === 'sales'
  const stats = useMemo(() => {
    const active = customers.filter((customer) => customer.is_active).length
    const withPhone = customers.filter((customer) => customer.contact_phone).length
    return { active, withPhone }
  }, [customers])

  function openEdit(customer: Customer) {
    setEditForm({
      company_name: customer.company_name,
      contact_name: customer.contact_name,
      contact_email: customer.contact_email,
      contact_phone: customer.contact_phone || '',
      payment_terms: customer.payment_terms || '',
      notes: customer.notes || '',
      default_risk_mode: customer.default_risk_mode || '',
    })
    setEditTarget(customer)
  }

  async function handleUpdate() {
    if (!editTarget) return
    setIsSaving(true)
    try {
      const body: Record<string, unknown> = {
        company_name: editForm.company_name,
        contact_name: editForm.contact_name,
        contact_email: editForm.contact_email,
      }
      if (editForm.contact_phone) body.contact_phone = editForm.contact_phone
      if (editForm.payment_terms) body.payment_terms = editForm.payment_terms
      if (editForm.notes) body.notes = editForm.notes
      if (editForm.default_risk_mode) body.default_risk_mode = editForm.default_risk_mode
      const res = await fetch(`/api/customers/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update customer')
      }
      toast.success('Customer updated')
      setEditTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update customer')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await remove(deleteTarget.id)
      toast.success('Customer deleted')
      setDeleteTarget(null)
      refetch()
    } catch {
      toast.error('Failed to delete customer')
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Customer Accounts"
        title="Customer relationships with cleaner visibility and less admin drag."
        description="Search accounts, review contact details, and move between customer records without losing operational context."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/customers/export${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`} download>
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </a>
            </Button>
            {canCreate && (
              <Link href="/customers/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Customer
                </Button>
              </Link>
            )}
          </>
        }
        stats={[
          { label: 'Visible accounts', value: total },
          { label: 'Active in view', value: stats.active },
          { label: 'With phone data', value: stats.withPhone },
          { label: 'Organization scoped', value: organizationId ? 'Yes' : 'No' },
        ]}
      />

      {organizationId && (
        <div className="rounded-[1.5rem] border border-border dark:border-white/8 bg-muted/50 dark:bg-white/[0.04] px-5 py-4 text-sm text-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground">Scope active.</span>
            <span>Showing customers for one organization.</span>
            <Link href="/admin/organizations" className="text-primary hover:text-primary/70">
              View organizations
            </Link>
            <Link href="/customers" className="ml-auto text-primary hover:text-primary/70">
              Clear filter
            </Link>
          </div>
        </div>
      )}

      <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl">Customer index</CardTitle>
          <CardDescription className="mt-2">
            Search the book of accounts and jump into detailed customer views.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            <Input
              placeholder="Search customers by company or contact email..."
              className="pl-11"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 rounded-[1rem] bg-muted dark:bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-[1.6rem] border border-dashed border-destructive/40 bg-destructive/5 px-6 py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-destructive/60" />
              <p className="mt-4 text-lg font-semibold text-destructive">Failed to load customers</p>
              <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : 'An unexpected error occurred.'}</p>
              <Button variant="outline" className="mt-5" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.025] px-6 py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-lg font-semibold">No customers found.</p>
              <p className="mt-2 text-sm text-muted-foreground">Create a customer account to start building the customer-side operating view.</p>
              {canCreate && (
                <Link href="/customers/new">
                  <Button className="mt-5">Add customer</Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Payment terms</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    {(canEdit || canDelete) && <TableHead className="w-[56px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Link href={`/customers/${customer.id}`} className="font-medium text-primary hover:underline">
                          {customer.company_name}
                        </Link>
                      </TableCell>
                      <TableCell>{customer.contact_name}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.contact_email}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.contact_phone || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.payment_terms || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={customer.is_active ? 'default' : 'secondary'}>
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(customer.created_at).toLocaleDateString('en-US', { timeZone: 'America/Toronto' })}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEdit && (
                                <DropdownMenuItem onClick={() => openEdit(customer)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit customer
                                </DropdownMenuItem>
                              )}
                              {canEdit && canDelete && <DropdownMenuSeparator />}
                              {canDelete && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(customer)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete customer
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input value={editForm.company_name} onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Contact Name *</Label>
                <Input value={editForm.contact_name} onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Email *</Label>
                <Input type="email" value={editForm.contact_email} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input value={editForm.contact_phone} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Input value={editForm.payment_terms} onChange={e => setEditForm(f => ({ ...f, payment_terms: e.target.value }))} placeholder="e.g. Net 30" />
              </div>
              <div className="space-y-2">
                <Label>Default Risk Mode</Label>
                <Select value={editForm.default_risk_mode} onValueChange={v => setEditForm(f => ({ ...f, default_risk_mode: v as 'retail' | 'enterprise' | '' }))}>
                  <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes about this customer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              onClick={handleUpdate}
              disabled={isSaving || !editForm.company_name || !editForm.contact_name || !editForm.contact_email}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  This will deactivate <strong>{deleteTarget.company_name}</strong>. They will disappear from the active
                  customer list and won’t be easy to restore.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
