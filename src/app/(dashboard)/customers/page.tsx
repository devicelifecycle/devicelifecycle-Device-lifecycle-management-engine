// ============================================================================
// CUSTOMERS LIST PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Users } from 'lucide-react'
import { useCustomers } from '@/hooks/useCustomers'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { Pagination } from '@/components/ui/pagination'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search)
  const { customers, total, isLoading, totalPages } = useCustomers({ search: debouncedSearch, page })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your customer accounts
          </p>
        </div>
        <Link href="/customers/new">
          <Button className="shadow-md shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" />
            New Customer
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customers by name or email..."
          className="pl-10 bg-background"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">All Customers</CardTitle>
          <CardDescription>{total} total customers</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-16">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No customers found</p>
              <p className="mt-1 text-xs text-muted-foreground">Create your first customer to get started.</p>
              <Link href="/customers/new">
                <Button size="sm" className="mt-4">Add Customer</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id} className="group">
                    <TableCell>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {customer.company_name}
                      </Link>
                    </TableCell>
                    <TableCell>{customer.contact_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{customer.contact_email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{customer.contact_phone || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={customer.is_active ? 'default' : 'secondary'}
                        className="text-[11px]"
                      >
                        {customer.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeTime(customer.created_at)}
                    </TableCell>
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
