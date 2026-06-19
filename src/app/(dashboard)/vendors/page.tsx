'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Download, Plus, Search, Store, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useVendors } from '@/hooks/useVendors'
import { useAuth } from '@/hooks/useAuth'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Vendor } from '@/types'

export default function VendorsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canCreate = user?.role === 'admin' || user?.role === 'coe_manager'
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)

  // Main list always shows active vendors only — deleted ones live on their
  // own /vendors/deleted page (with a Restore action) instead of a filter
  // dropdown, so there's one unambiguous place to find them.
  const { vendors, total, isLoading, totalPages, error, remove, isDeleting } = useVendors({
    search: debouncedSearch,
    page,
    is_active: true,
  })

  const handleDeleteVendor = async () => {
    if (!deleteTarget) return
    try {
      await remove(deleteTarget.id)
      toast.success(`${deleteTarget.company_name} deleted`)
      setDeleteTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete vendor')
    }
  }

  const stats = useMemo(() => {
    const active = vendors.filter((vendor) => vendor.is_active).length
    const rated = vendors.filter((vendor) => vendor.rating != null).length
    const warranty = vendors.filter((vendor) => vendor.warranty_period_days != null).length
    return { active, rated, warranty }
  }, [vendors])

  if (error) {
    return (
      <div className="space-y-6">
        <PageHero
          eyebrow="Vendor Network"
          title="Vendors"
          description="The vendor layer could not be loaded in this session."
        />
        <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
          <CardContent className="py-16 text-center">
            <p className="text-lg font-semibold text-red-400">Failed to load vendors</p>
            <p className="mt-2 text-sm text-muted-foreground">
              You may not have permission to view this page, or the connection to the backend failed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Vendor Network"
        title="A cleaner view of the partner layer behind sourcing and fulfillment."
        description="Review vendor profiles, compare readiness signals, and move into detailed vendor records without losing search context."
        actions={
          <>
            <Button
              variant="outline"
              asChild
            >
              <a
                href={`/api/vendors/export${debouncedSearch ? `?${new URLSearchParams({ search: debouncedSearch }).toString()}` : ''}`}
                download
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </a>
            </Button>
            {isAdmin && (
              <Link href="/vendors/deleted">
                <Button variant="outline">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Deleted
                </Button>
              </Link>
            )}
            {canCreate && (
              <Link href="/vendors/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Vendor
                </Button>
              </Link>
            )}
          </>
        }
        stats={[
          { label: 'Visible vendors', value: total },
          { label: 'Active in view', value: stats.active },
          { label: 'Rated vendors', value: stats.rated },
          { label: 'Warranty profiles', value: stats.warranty },
        ]}
      />

      <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl">Vendor directory</CardTitle>
          <CardDescription className="mt-2">
            Filter the vendor roster, inspect reliability signals, and open full vendor records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
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
          ) : vendors.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.025] px-6 py-16 text-center">
              <Store className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-lg font-semibold">No vendors found.</p>
              <p className="mt-2 text-sm text-muted-foreground">Add a vendor profile to activate the sourcing side of the system.</p>
              {canCreate && (
                <Link href="/vendors/new">
                  <Button className="mt-5">Add vendor</Button>
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
                    <TableHead>Rating</TableHead>
                    <TableHead>Warranty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    {isAdmin && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id} className="cursor-pointer" onClick={() => router.push(`/vendors/${vendor.id}`)}>
                      <TableCell>
                        <Link href={`/vendors/${vendor.id}`} className="font-medium text-primary hover:underline">
                          {vendor.company_name}
                        </Link>
                      </TableCell>
                      <TableCell>{vendor.contact_name}</TableCell>
                      <TableCell className="text-muted-foreground">{vendor.contact_email}</TableCell>
                      <TableCell className="text-muted-foreground">{vendor.contact_phone || '—'}</TableCell>
                      <TableCell>
                        {vendor.rating ? (
                          <span className="inline-flex items-center gap-1 text-sm text-foreground">
                            <span className="text-amber-300">★</span>
                            {vendor.rating}/5
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{vendor.warranty_period_days ? `${vendor.warranty_period_days}d` : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant={vendor.is_active ? 'default' : 'secondary'}>
                          {vendor.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vendor.created_at ? new Date(vendor.created_at).toLocaleDateString('en-US', { timeZone: 'America/Toronto' }) : '—'}
                      </TableCell>
                      {isAdmin && (
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(vendor)}
                            title="Delete vendor"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate <strong>{deleteTarget?.company_name}</strong>. They'll disappear from the active vendor list and from order assignment. Their bid and order history is kept for audit, and you can restore them later from the Deleted vendors page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteVendor}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Vendor'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
