'use client'

// ============================================================================
// CUSTOMER API KEYS — self-service token management
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Copy, Key, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export default function CustomerApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customer/api-keys')
      if (res.status === 403) { toast.error('API access is not enabled on your plan'); return }
      if (!res.ok) throw new Error()
      const json = await res.json()
      setKeys(json.data ?? [])
    } catch {
      toast.error('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/customer/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes: ['read'] }),
      })
      if (!res.ok) { toast.error('Failed to create key'); return }
      const json = await res.json()
      setNewSecret(json.data.key)
      setName('')
      toast.success('API key created')
      load()
    } catch {
      toast.error('Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    try {
      const res = await fetch(`/api/customer/api-keys/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Key revoked')
      load()
    } catch {
      toast.error('Failed to revoke key')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const active = keys.filter((k) => !k.revoked_at)
  const revoked = keys.filter((k) => k.revoked_at)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage API keys for programmatic access to your data.
        </p>
      </div>

      {/* Create key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create API Key
          </CardTitle>
          <CardDescription>Keys are shown once on creation and cannot be retrieved later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. ERP Integration"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={create} disabled={creating || !name.trim()}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
                Create
              </Button>
            </div>
          </div>
          {newSecret && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-300">
                Copy your API key now — it will not be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm dark:bg-green-950/50">
                  {newSecret}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { navigator.clipboard.writeText(newSecret); toast.success('Copied') }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active keys */}
      <Card>
        <CardHeader>
          <CardTitle>Active Keys</CardTitle>
          <CardDescription>{active.length} key{active.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No active API keys.</p>
          ) : (
            <div className="space-y-3">
              {active.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium text-sm">{k.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{k.key_prefix}...</span>
                      {' · '}Created {formatDateTime(k.created_at)}
                      {k.last_used_at && <> · Last used {formatDateTime(k.last_used_at)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{(k.scopes ?? ['read']).join(', ')}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => revoke(k.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoked keys */}
      {revoked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">Revoked Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revoked.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border border-dashed p-3 opacity-60">
                  <div>
                    <p className="text-sm line-through">{k.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}...</p>
                  </div>
                  <Badge variant="destructive" className="text-xs">Revoked</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
