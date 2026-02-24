// ============================================================================
// VENDORS LIST PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Store } from 'lucide-react'
import { useVendors } from '@/hooks/useVendors'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { Pagination } from '@/components/ui/pagination'

export default function VendorsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search)
  const { vendors, total, isLoading, totalPages } = useVendors({ search: debouncedSearch, page })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground mt-1">Manage vendor profiles and assignments</p>
        </div>
        <Link href="/vendors/new">
          <Button className="shadow-md shadow-primary/20"><Plus className="mr-2 h-4 w-4" />New Vendor</Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search vendors..." className="pl-10 bg-background" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">All Vendors</CardTitle>
          <CardDescription>{total} total vendors</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-16">
              <Store className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No vendors found</p>
              <p className="mt-1 text-xs text-muted-foreground">Add your first vendor to get started.</p>
              <Link href="/vendors/new">
                <Button size="sm" className="mt-4">Add Vendor</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map(vendor => (
                  <TableRow key={vendor.id} className="cursor-pointer group" onClick={() => router.push(`/vendors/${vendor.id}`)}>
                    <TableCell>
                      <Link href={`/vendors/${vendor.id}`} className="font-medium text-primary hover:underline">{vendor.company_name}</Link>
                    </TableCell>
                    <TableCell>{vendor.contact_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{vendor.contact_email}</TableCell>
                    <TableCell>
                      {vendor.rating ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <span className="text-amber-500">★</span>
                          {vendor.rating}/5
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {vendor.warranty_period_days ? (
                        <span className="text-sm">{vendor.warranty_period_days}d</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={vendor.is_active ? 'default' : 'secondary'} className="text-[11px]">
                        {vendor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(vendor.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  )
}
