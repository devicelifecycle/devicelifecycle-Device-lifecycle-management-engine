// ============================================================================
// ADMIN - SLA RULES MANAGEMENT PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useOnDbChange } from '@/hooks/useOnDbChange'
import { Plus, Clock, AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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
import { ORDER_STATUS_CONFIG, DEFAULT_SLA_HOURS } from '@/lib/constants'
import type { SLARule, OrderStatus, OrderType } from '@/types'

const statuses: OrderStatus[] = [
  'draft', 'submitted', 'quoted', 'accepted', 'sourcing', 'sourced',
  'shipped_to_coe', 'received', 'in_triage', 'qc_complete', 'ready_to_ship', 'shipped', 'delivered',
]

export default function AdminSLARulesPage() {
  const [rules, setRules] = useState<SLARule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    from_status: 'submitted' as OrderStatus,
    order_type: '' as string,
    warning_hours: '4',
    breach_hours: '8',
  })

  const fetchRules = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/sla-rules')
      if (res.ok) {
        const data = await res.json()
        setRules(data.data || [])
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])
  useOnDbChange(fetchRules)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/sla-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          from_status: form.from_status,
          order_type: form.order_type || null,
          warning_hours: parseInt(form.warning_hours) || 4,
          breach_hours: parseInt(form.breach_hours) || 8,
          escalation_user_ids: [],
          is_active: true,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('SLA rule created')
      setDialogOpen(false)
      setForm({ name: '', description: '', from_status: 'submitted', order_type: '', warning_hours: '4', breach_hours: '8' })
      fetchRules()
    } catch {
      toast.error('Failed to create SLA rule')
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (rule: SLARule) => {
    try {
      const res = await fetch(`/api/admin/sla-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rule.is_active }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Rule ${rule.is_active ? 'disabled' : 'enabled'}`)
      fetchRules()
    } catch {
      toast.error('Failed to update rule')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/sla-rules/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('SLA rule deleted')
      fetchRules()
    } catch {
      toast.error('Failed to delete rule')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SLA Rules</h1>
          <p className="text-muted-foreground">Configure warning and breach thresholds for order statuses</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="success"><Plus className="mr-2 h-4 w-4" />Add Rule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add SLA Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Quote Response Time" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Status</Label>
                  <Select value={form.from_status} onValueChange={v => setForm(f => ({ ...f, from_status: v as OrderStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statuses.map(s => (
                        <SelectItem key={s} value={s}>{ORDER_STATUS_CONFIG[s]?.label || s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Order Type</Label>
                  <Select value={form.order_type || 'all'} onValueChange={v => setForm(f => ({ ...f, order_type: v === 'all' ? '' : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="cpo">CPO</SelectItem>
                      <SelectItem value="trade_in">Trade-In</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Warning (hours)</Label>
                  <Input type="number" value={form.warning_hours} onChange={e => setForm(f => ({ ...f, warning_hours: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Breach (hours)</Label>
                  <Input type="number" value={form.breach_hours} onChange={e => setForm(f => ({ ...f, breach_hours: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button variant="success" onClick={handleCreate} disabled={creating || !form.name || !form.warning_hours || !form.breach_hours}>
                {creating ? 'Creating...' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Default SLA Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default SLA Thresholds (Reference)</CardTitle>
          <CardDescription>Built-in defaults used when no custom rule exists</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(DEFAULT_SLA_HOURS).map(([key, val]) => (
              <div key={key} className="rounded-lg border p-3">
                <p className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</p>
                <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
                  <span className="text-yellow-600">Warn: {val.warning}h</span>
                  <span className="text-red-600">Breach: {val.breach}h</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rules Table */}
      <Card>
        <CardHeader><CardTitle>Custom SLA Rules ({rules.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mb-4" />
              <p>No custom SLA rules configured</p>
              <p className="text-sm mt-1">Default thresholds above are used</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>From Status</TableHead>
                  <TableHead>Order Type</TableHead>
                  <TableHead>Warning</TableHead>
                  <TableHead>Breach</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{rule.name}</p>
                        {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ORDER_STATUS_CONFIG[rule.from_status]?.label || rule.from_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{rule.order_type ? rule.order_type.toUpperCase().replace('_', '-') : 'All'}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle className="h-3 w-3" />{rule.warning_hours}h
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-red-600 font-medium">{rule.breach_hours}h</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={rule.is_active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => handleToggle(rule)}
                      >
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(rule.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SLA Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this SLA rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
