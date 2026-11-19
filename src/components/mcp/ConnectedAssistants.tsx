'use client'

// Connected assistants — the signed-in user's OAuth grants to AI assistants
// (Claude, Cursor…), with Disconnect. Backed by /api/oauth/grants.

import { useCallback, useEffect, useState } from 'react'
import { Bot, Loader2, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'

interface Grant { id: string; client_name: string; scopes: string[]; connected_at: string; last_used_at: string | null }

export function ConnectedAssistants() {
  const [grants, setGrants] = useState<Grant[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/oauth/grants')
      setGrants(r.ok ? ((await r.json()).data ?? []) : [])
    } catch { setGrants([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const disconnect = async (g: Grant) => {
    setBusy(g.id)
    try {
      const r = await fetch(`/api/oauth/grants?id=${g.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success(`${g.client_name} disconnected`)
      await load()
    } catch {
      toast.error('Could not disconnect')
    } finally { setBusy(null) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" /> Connected assistants</CardTitle>
        <CardDescription>AI assistants you signed in to with your own DLM account. Each sees only what you can see. Disconnecting stops it immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        {grants === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assistants connected.</p>
        ) : (
          <ul className="divide-y">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{g.client_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Connected {formatDateTime(g.connected_at)} · {g.last_used_at ? `last used ${formatDateTime(g.last_used_at)}` : 'not used yet'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{g.scopes.includes('dlm:write') ? 'Read + act (with confirmation)' : 'Read only'}</Badge>
                  <Button size="sm" variant="outline" disabled={busy === g.id} onClick={() => disconnect(g)}>
                    {busy === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect</>}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
