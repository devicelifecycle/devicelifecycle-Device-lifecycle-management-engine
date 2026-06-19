'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RotateCcw, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers } from '@/hooks/useCustomers'
import { useAuth } from '@/hooks/useAuth'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'

export default function DeletedCustomersPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search)

  const canRestore = user?.role === 'admin' || user?.role === 'coe_manager'

  const { customers, total, isLoading, totalPages, error, update, refetch } = useCustomers({
    search: debouncedSearch,
    page,
    is_active: false,
  })

  const handleRestore = async (id: string, name: string) => {
    setRestoringId(id)
    try {
      await update({ id, data: { is_active: true } })
      toast.success(`${name} restored`)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore customer')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Customer Accounts"
        title="Deleted customers"
        description="Customers removed from the active list. Restore one to bring it back into normal operation."
        actions={
          <Link href="/customers">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to customers
            </Button>
          </Link>
        }
        stats={[{ label: 'Deleted accounts', value: total }]}
      />

      <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl">Deleted customer archive</CardTitle>
          <CardDescription className="mt-2">
            These accounts are hidden from the main customer list but kept for audit history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search deleted customers..."
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
              <p className="mt-4 text-lg font-semibold text-destructive">Failed to load deleted customers</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.025] px-6 py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-lg font-semibold">No deleted customers.</p>
              <p className="mt-2 text-sm text-muted-foreground">Anything deleted from the customer list will show up here.</p>
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
                    <TableHead>Status</TableHead>
                    {canRestore && <TableHead className="w-[140px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.company_name}</TableCell>
                      <TableCell>{customer.contact_name}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.contact_email}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.contact_phone || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Deleted</Badge>
                      </TableCell>
                      {canRestore && (
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={restoringId === customer.id}
                            onClick={() => handleRestore(customer.id, customer.company_name)}
                          >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            {restoringId === customer.id ? 'Restoring...' : 'Restore'}
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
    </div>
  )
}
