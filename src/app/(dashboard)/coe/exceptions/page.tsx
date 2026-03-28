// ============================================================================
// COE EXCEPTIONS PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDebounce } from '@/hooks/useDebounce'
import { CONDITION_CONFIG } from '@/lib/constants'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { TriageResult } from '@/types'

export default function COEExceptionsPage() {
  const [exceptions, setExceptions] = useState<TriageResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  // Decision dialog
  const [selected, setSelected] = useState<TriageResult | null>(null)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const fetchExceptions = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/triage?type=exceptions')
      if (res.ok) {
        const data = await res.json()
        setExceptions(data.data || [])
      }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchExceptions() }, [fetchExceptions])

  const handleDecision = async () => {
    if (!selected || !action) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/triage/${selected.id}/exception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: action === 'approve',
          notes: decisionNotes,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Exception ${action === 'approve' ? 'approved' : 'rejected'}`)
      setSelected(null)
      setAction(null)
      setDecisionNotes('')
      fetchExceptions()
    } catch {
      toast.error('Failed to process exception')
    } finally { setIsProcessing(false) }
  }

  const filtered = exceptions.filter(e => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      e.exception_reason?.toLowerCase().includes(q) ||
      (e.imei_record as unknown as Record<string, string>)?.imei?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exceptions</h1>
          <p className="text-muted-foreground">Review condition mismatches requiring approval</p>
        </div>
        <Badge variant={exceptions.length > 0 ? 'destructive' : 'default'} className="text-sm px-3 py-1">
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />{exceptions.length} pending
        </Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search exceptions..." className="pl-10 bg-background" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Exceptions</CardTitle>
          <CardDescription>Devices with condition mismatch between claimed and actual grade</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mb-3 text-green-400" />
              <p className="text-sm font-medium">No pending exceptions</p>
              <p className="text-xs mt-1">All devices have passed triage or been reviewed.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IMEI</TableHead>
                  <TableHead>Claimed</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Price Adj.</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Triaged By</TableHead>
                  <TableHead>Triaged</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(exc => {
                  const imei = exc.imei_record as unknown as Record<string, string> | undefined
                  return (
                    <TableRow key={exc.id}>
                      <TableCell className="font-mono text-sm">{imei?.imei || '—'}</TableCell>
                      <TableCell>
                        {imei?.claimed_condition && (
                          <span className={CONDITION_CONFIG[imei.claimed_condition as keyof typeof CONDITION_CONFIG]?.color}>
                            {CONDITION_CONFIG[imei.claimed_condition as keyof typeof CONDITION_CONFIG]?.label}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {exc.final_condition && (
                          <span className={CONDITION_CONFIG[exc.final_condition]?.color}>
                            {CONDITION_CONFIG[exc.final_condition]?.label}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {exc.price_adjustment != null && (
                          <span className={exc.price_adjustment < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                            {exc.price_adjustment < 0 ? '−' : '+'}{formatCurrency(Math.abs(exc.price_adjustment))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-sm text-muted-foreground truncate">{exc.exception_reason || '—'}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(exc.triaged_by as { full_name?: string })?.full_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {exc.triaged_at ? formatDateTime(exc.triaged_at) : (exc.created_at ? formatDateTime(exc.created_at) : '—')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelected(exc); setAction('approve'); }}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-600" />Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelected(exc); setAction('reject'); }}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5 text-red-600" />Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Decision Dialog */}
      <AlertDialog open={!!selected && !!action} onOpenChange={(open) => { if (!open) { setSelected(null); setAction(null); setDecisionNotes('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === 'approve' ? 'Approve' : 'Reject'} Exception
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'approve'
                ? 'Accept the new condition grade and adjusted pricing for this device.'
                : 'Reject the triage result. The device will be flagged for re-inspection.'
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-sm">Decision Notes (optional)</Label>
            <Textarea
              placeholder="Reason for your decision..."
              value={decisionNotes}
              onChange={e => setDecisionNotes(e.target.value)}
              rows={3}
              className="mt-1.5"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={action === 'reject' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              disabled={isProcessing}
              onClick={handleDecision}
            >
              {isProcessing ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
