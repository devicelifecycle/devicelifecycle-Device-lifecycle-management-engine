'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Download, Plus, Search, Store } from 'lucide-react'
import { useVendors } from '@/hooks/useVendors'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'

export default function VendorsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const debouncedSearch = useDebounce(search)

  const isActiveFilter = statusFilter === 'all' ? undefined : statusFilter === 'active'
  const { vendors, total, isLoading, totalPages, error } = useVendors({
    search: debouncedSearch,
    page,
    is_active: isActiveFilter,
  })

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
        <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
          <CardContent className="py-16 text-center">
            <p className="text-lg font-semibold text-rose-200">Failed to load vendors</p>
            <p className="mt-2 text-sm text-stone-500">
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
                href={`/api/vendors/export${debouncedSearch || statusFilter !== 'all' ? `?${new URLSearchParams({
                  ...(debouncedSearch && { search: debouncedSearch }),
                  ...(statusFilter !== 'all' && { is_active: statusFilter === 'active' ? 'true' : 'false' }),
                }).toString()}` : ''}`}
                download
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </a>
            </Button>
            <Link href="/vendors/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Vendor
              </Button>
            </Link>
          </>
        }
        stats={[
          { label: 'Visible vendors', value: total },
          { label: 'Active in view', value: stats.active },
          { label: 'Rated vendors', value: stats.rated },
          { label: 'Warranty profiles', value: stats.warranty },
        ]}
      />

      <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
        <CardHeader>
          <CardTitle className="text-2xl text-stone-100">Vendor directory</CardTitle>
          <CardDescription className="mt-2 text-stone-400">
            Filter the vendor roster, inspect reliability signals, and open full vendor records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
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
            <select
              className="h-11 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-stone-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_-24px_rgba(0,0,0,0.45)]"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')
                setPage(1)
              }}
            >
              <option value="all">All vendors</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 rounded-[1rem] bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
              <Store className="mx-auto h-10 w-10 text-stone-600" />
              <p className="mt-4 text-lg font-semibold text-stone-200">No vendors found.</p>
              <p className="mt-2 text-sm text-stone-500">Add a vendor profile to activate the sourcing side of the system.</p>
              <Link href="/vendors/new">
                <Button className="mt-5">Add vendor</Button>
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
                    <TableHead>Rating</TableHead>
                    <TableHead>Warranty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
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
                      <TableCell className="text-stone-400">{vendor.contact_email}</TableCell>
                      <TableCell className="text-stone-400">{vendor.contact_phone || '—'}</TableCell>
                      <TableCell>
                        {vendor.rating ? (
                          <span className="inline-flex items-center gap-1 text-sm text-stone-200">
                            <span className="text-amber-300">★</span>
                            {vendor.rating}/5
                          </span>
                        ) : (
                          <span className="text-stone-500">—</span>
                        )}
                      </TableCell>
                      <TableCell>{vendor.warranty_period_days ? `${vendor.warranty_period_days}d` : <span className="text-stone-500">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant={vendor.is_active ? 'default' : 'secondary'}>
                          {vendor.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-stone-400">
                        {vendor.created_at ? new Date(vendor.created_at).toLocaleDateString('en-US', { timeZone: 'America/Toronto' }) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
