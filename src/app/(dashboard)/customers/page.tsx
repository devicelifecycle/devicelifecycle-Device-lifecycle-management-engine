'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Download, MoreHorizontal, Plus, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers } from '@/hooks/useCustomers'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Customer } from '@/types'

export default function CustomersPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const debouncedSearch = useDebounce(search)
  const organizationId = searchParams.get('organization_id') || undefined

  const { customers, total, isLoading, totalPages, remove, isDeleting, refetch } = useCustomers({
    search: debouncedSearch,
    page,
    organization_id: organizationId,
  })

  const canDelete = user?.role === 'admin' || user?.role === 'coe_manager'
  const stats = useMemo(() => {
    const active = customers.filter((customer) => customer.is_active).length
    const withPhone = customers.filter((customer) => customer.contact_phone).length
    return { active, withPhone }
  }, [customers])

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
            <Link href="/customers/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Customer
              </Button>
            </Link>
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
        <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.04] px-5 py-4 text-sm text-stone-300">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-stone-500">Scope active.</span>
            <span>Showing customers for one organization.</span>
            <Link href="/admin/organizations" className="text-primary hover:text-amber-200">
              View organizations
            </Link>
            <Link href="/customers" className="ml-auto text-primary hover:text-amber-200">
              Clear filter
            </Link>
          </div>
        </div>
      )}

      <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
        <CardHeader>
          <CardTitle className="text-2xl text-stone-100">Customer index</CardTitle>
          <CardDescription className="mt-2 text-stone-400">
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
                <div key={index} className="h-16 rounded-[1rem] bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-stone-600" />
              <p className="mt-4 text-lg font-semibold text-stone-200">No customers found.</p>
              <p className="mt-2 text-sm text-stone-500">Create a customer account to start building the customer-side operating view.</p>
              <Link href="/customers/new">
                <Button className="mt-5">Add customer</Button>
              </Link>
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
                    {canDelete && <TableHead className="w-[56px]" />}
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
                      <TableCell className="text-stone-400">{customer.contact_email}</TableCell>
                      <TableCell className="text-stone-400">{customer.contact_phone || '—'}</TableCell>
                      <TableCell className="text-stone-400">{customer.payment_terms || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={customer.is_active ? 'default' : 'secondary'}>
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-stone-400">{new Date(customer.created_at).toLocaleDateString()}</TableCell>
                      {canDelete && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(customer)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete customer
                              </DropdownMenuItem>
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
