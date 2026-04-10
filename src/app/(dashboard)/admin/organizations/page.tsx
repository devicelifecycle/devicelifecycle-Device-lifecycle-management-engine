// ============================================================================
// ADMIN - ORGANIZATION MANAGEMENT PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useOnDbChange } from '@/hooks/useOnDbChange'
import Link from 'next/link'
import { Plus, Building2, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatDate } from '@/lib/utils'
import type { Organization, OrganizationType } from '@/types'

type OrganizationCreateResult = Organization & {
  portal_account_created?: boolean
  welcome_email_sent_to?: string | null
  welcome_email_sent?: boolean
  portal_account_skipped_reason?: string | null
}

const orgTypes: OrganizationType[] = ['internal', 'customer', 'vendor']

const typeColors: Record<string, string> = {
  internal: 'bg-blue-100 text-blue-700',
  customer: 'bg-green-100 text-green-700',
  vendor: 'bg-purple-100 text-purple-700',
}

export default function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null)
  const [form, setForm] = useState({
    name: '',
    type: 'customer' as OrganizationType,
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'USA',
  })

  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      const res = await fetch(`/api/organizations?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrganizations(data.data || [])
        setTotal(data.total || 0)
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => { fetchOrganizations() }, [fetchOrganizations])
  useOnDbChange(fetchOrganizations)

  const resetForm = () => {
    setForm({ name: '', type: 'customer', email: '', phone: '', address: '', city: '', state: '', zip_code: '', country: 'USA' })
    setEditingOrg(null)
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to create organization')
      const result = payload as OrganizationCreateResult
      if (result.portal_account_created && result.welcome_email_sent_to && result.welcome_email_sent) {
        toast.success(`Organization created and login details emailed to ${result.welcome_email_sent_to}`)
      } else if (result.portal_account_created && result.welcome_email_sent_to && result.welcome_email_sent === false) {
        toast.warning(`Organization created, but the welcome email could not be sent to ${result.welcome_email_sent_to}. Please retry or create the user manually.`)
      } else if (result.portal_account_skipped_reason) {
        toast.success(`Organization created. ${result.portal_account_skipped_reason}.`)
      } else {
        toast.success('Organization created')
      }
      setDialogOpen(false)
      resetForm()
      fetchOrganizations()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingOrg) return
    setCreating(true)
    try {
      const res = await fetch(`/api/organizations/${editingOrg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          contact_email: form.email,
          contact_phone: form.phone,
          address: { street: form.address, city: form.city, state: form.state, zip_code: form.zip_code, country: form.country },
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Organization updated')
      setDialogOpen(false)
      resetForm()
      fetchOrganizations()
    } catch {
      toast.error('Failed to update organization')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (org: Organization) => {
    const addr = (org.address || {}) as Record<string, string>
    setEditingOrg(org)
    setForm({
      name: org.name,
      type: org.type,
      email: org.contact_email || '',
      phone: org.contact_phone || '',
      address: addr.street || '',
      city: addr.city || '',
      state: addr.state || '',
      zip_code: addr.zip_code || '',
      country: addr.country || 'USA',
    })
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingOrg) return
    try {
      const res = await fetch(`/api/organizations/${deletingOrg.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete')
      }
      toast.success('Organization deleted. All related orders, customers, and vendors were removed.')
      setDeletingOrg(null)
      fetchOrganizations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete organization')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organization Management</h1>
          <p className="text-muted-foreground">Manage companies and organizations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add Organization</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingOrg ? 'Edit Organization' : 'Add New Organization'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Organization Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Company name" />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as OrganizationType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {orgTypes.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Email{form.type !== 'internal' ? ' *' : ''}</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@company.com" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                </div>
              </div>
              {form.type !== 'internal' && (
                <p className="text-xs text-muted-foreground">
                  Creating a {form.type} organization also creates its portal login and emails the temporary password to this address.
                </p>
              )}
              <div className="space-y-2">
                <Label>Street Address</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St" />
              </div>
              <div className="grid gap-4 grid-cols-3">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>ZIP Code</Label>
                  <Input value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Cancel</Button>
              <Button
                onClick={editingOrg ? handleUpdate : handleCreate}
                disabled={creating || !form.name || (!editingOrg && form.type !== 'internal' && !form.email)}
              >
                {creating ? 'Saving...' : editingOrg ? 'Update' : 'Create Organization'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search organizations..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Organizations Table */}
      <Card>
        <CardHeader><CardTitle>All Organizations ({total})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : organizations.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mb-4" />
              <p>No organizations found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Linked Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map(org => (
                  <TableRow
                    key={org.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(org)}
                  >
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[org.type] || ''}`}>
                        {org.type}
                      </span>
                    </TableCell>
                    <TableCell>{org.contact_email || '—'}</TableCell>
                    <TableCell>{org.contact_phone || '—'}</TableCell>
                    <TableCell>
                      {org.type === 'customer' ? (
                        <Link href={`/customers?organization_id=${org.id}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>
                          View customer(s)
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.is_active ? 'default' : 'secondary'}>
                        {org.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(org.created_at)}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingOrg(org)}
                        title="Delete organization"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingOrg} onOpenChange={(open) => !open && setDeletingOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deletingOrg?.name}</strong> and all related orders, customers, and vendors.
              Users linked to this organization will be unlinked. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
