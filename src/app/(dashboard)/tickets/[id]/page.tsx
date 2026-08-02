'use client'

// ============================================================================
// SUPPORT — TICKET THREAD (messages, reply, status transitions)
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/utils'
import { canTransitionTicket, STATUS_LABEL, TICKET_STATUSES, type TicketStatus } from '@/lib/tickets'

interface Ticket { id: string; subject: string; status: TicketStatus; priority: string; created_at: string }
interface Message { id: string; author_id: string | null; body: string; created_at: string }

export default function TicketDetailPage() {
  return <ComingSoon title="Support" />
}

function TicketDetailPageImpl() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`)
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setTicket(data.ticket)
      setMessages(data.messages)
    } catch {
      toast.error('Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const send = async () => {
    if (!reply.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || 'Failed to send') }
      setReply('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const setStatus = async (status: TicketStatus) => {
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || 'Failed to update status') }
      toast.success(`Ticket ${STATUS_LABEL[status]}`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  if (loading) return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  if (!ticket) return <div className="p-8 text-sm text-muted-foreground">Ticket not found.</div>

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <button type="button" onClick={() => router.push('/tickets')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All tickets
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{ticket.priority} priority · {STATUS_LABEL[ticket.status]}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {TICKET_STATUSES.filter((s) => canTransitionTicket(ticket.status, s)).map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Conversation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No messages yet.</p>
          ) : messages.map((m) => (
            <div key={m.id} className="rounded-lg border bg-muted/30 p-3">
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(m.created_at)}</p>
            </div>
          ))}
          <div className="space-y-2 pt-2">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Write a reply…" maxLength={5000} />
            <Button onClick={send} disabled={sending || !reply.trim()}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send reply
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
