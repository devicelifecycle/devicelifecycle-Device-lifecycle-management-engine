'use client'

// ============================================================================
// SUPPORT — TICKETS (list + create), tenant-scoped by the API
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LifeBuoy, Loader2, Plus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { STATUS_LABEL, TICKET_PRIORITIES, type TicketStatus } from '@/lib/tickets'

interface Ticket {
  id: string
  subject: string
  status: TicketStatus
  priority: string
  created_at: string
  updated_at: string
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-muted text-muted-foreground',
}
const PRIORITY_STYLES: Record<string, string> = {
  low: 'text-muted-foreground', normal: 'text-foreground', high: 'text-amber-600', urgent: 'text-red-600 font-semibold',
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [priority, setPriority] = useState('normal')
  const [body, setBody] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets')
      if (!res.ok) throw new Error()
      setTickets((await res.json()).data ?? [])
    } catch {
      toast.error('Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (subject.trim().length < 3) { toast.error('Subject is required'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), priority, body: body.trim() || undefined }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || 'Failed to create ticket') }
      toast.success('Ticket created')
      setSubject(''); setBody(''); setPriority('normal')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <LifeBuoy className="h-6 w-6 text-primary" /> Support
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Raise and track support tickets.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> New ticket</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5"><Label className="text-xs">Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" maxLength={200} /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Details <span className="text-muted-foreground">(optional)</span></Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000} /></div>
            <Button type="submit" disabled={creating}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create ticket</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tickets</CardTitle>
          <CardDescription>{loading ? 'Loading…' : `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : tickets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No tickets yet.</p>
          ) : (
            <div className="divide-y">
              {tickets.map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className={`text-xs capitalize ${PRIORITY_STYLES[t.priority] ?? ''}`}>{t.priority} priority</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status] ?? 'bg-muted'}`}>{STATUS_LABEL[t.status]}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
