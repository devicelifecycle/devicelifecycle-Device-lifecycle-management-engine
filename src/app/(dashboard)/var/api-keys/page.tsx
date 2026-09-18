'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Key, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/utils'

interface ApiKey {
  id: string
  tenant_id: string
  name: string
  key_prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export default function VarApiKeysPageImpl() {
  const { isAdmin } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<{ read: boolean; write: boolean }>({ read: true, write: true })
  const [tenantId, setTenantId] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/var/api-keys')
      if (res.ok) setKeys((await res.json()).data ?? [])
    } catch {
      toast.error('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async () => {
    if (!name.trim()) { toast.error('Enter a name'); return }
    const body: Record<string, unknown> = {
      name: name.trim(),
      scopes: [
        ...(scopes.read ? ['read'] : []),
        ...(scopes.write ? ['write'] : []),
      ],
    }
    if (isAdmin() && tenantId.trim()) body.tenant_id = tenantId.trim()
    setCreating(true)
    try {
      const res = await fetch('/api/var/api-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to create API key')
      setNewKey(j.data.key)
      setName('')
      setTenantId('')
      setScopes({ read: true, write: true })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: string) => {
    try {
      const res = await fetch(`/api/var/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('API key revoked')
      await load()
    } catch {
      toast.error('Failed to revoke API key')
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Key className="h-6 w-6 text-primary" /> API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">Programmatic access for your tenant. Keep keys secret — they are shown only once.</p>
      </div>

      {/* Keep this list in step with src/app/api/v1 — it is the only in-product
          reference an integrator sees. Full details live in docs/PUBLIC_API_v1.md. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Using your key</CardTitle>
          <CardDescription>
            Read-only access to your tenant&apos;s data at <code>/api/v1</code>. Send the key as a
            bearer token; every response is limited to your tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`curl https://<your-domain>/api/v1/me \\
  -H "Authorization: Bearer dlm_…"`}
          </pre>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-left uppercase tracking-wide text-muted-foreground">
                <th className="pb-1.5 pr-4 font-medium">Endpoint</th><th className="pb-1.5 font-medium">Filters</th>
              </tr></thead>
              <tbody className="[&_td]:py-1.5 [&_td]:pr-4 [&_code]:font-mono">
                <tr className="border-b"><td><code>GET /api/v1/me</code></td><td>— (any scope; identifies the key)</td></tr>
                <tr className="border-b"><td><code>GET /api/v1/orders</code></td><td><code>status</code>, <code>type</code>, <code>customer_id</code>, <code>updated_since</code>, <code>limit</code>, <code>offset</code></td></tr>
                <tr className="border-b"><td><code>GET /api/v1/orders/{'{id}'}</code></td><td>includes line items and device details</td></tr>
                <tr className="border-b"><td><code>GET /api/v1/customers</code></td><td><code>q</code>, <code>is_active</code>, <code>limit</code>, <code>offset</code></td></tr>
                <tr className="border-b"><td><code>GET /api/v1/customers/{'{id}'}</code></td><td></td></tr>
                <tr><td><code>GET /api/v1/devices</code></td><td><code>customer_id</code>, <code>status</code>, <code>limit</code>, <code>offset</code></td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Lists return <code>{'{ data, page: { limit, offset, total } }'}</code>; <code>limit</code> is capped at 200.
            Rate limit: 100 requests per minute per key. The <code>read</code> scope is required for every
            endpoint except <code>/me</code>; <code>write</code> is reserved for a future release and unlocks nothing today.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Create a key</CardTitle>
          <CardDescription>Scopes: <code>read</code> (list/view) and <code>write</code> (create/update).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Integration — billing sync" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scopes</Label>
              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={scopes.read} onChange={(e) => setScopes((s) => ({ ...s, read: e.target.checked }))} /> read</label>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={scopes.write} onChange={(e) => setScopes((s) => ({ ...s, write: e.target.checked }))} /> write</label>
              </div>
            </div>
            <Button onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Create key'}</Button>
          </div>
          {isAdmin() && (
            <div className="space-y-1.5 max-w-sm">
              <Label className="text-xs">Tenant ID (admin only)</Label>
              <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="UUID of tenant to scope the key to" />
            </div>
          )}
          {newKey && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-xs font-medium text-emerald-200">Copy this key now — it won&apos;t be shown again.</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-black/30 px-2 py-1 text-xs">{newKey}</code>
                <Button size="sm" variant="outline" onClick={() => copy(newKey)}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Your keys</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-sm text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Key</th>
                  <th className="pb-2 pr-4 font-medium">Scopes</th>
                  <th className="pb-2 pr-4 font-medium">Created</th>
                  <th className="pb-2 pr-4 font-medium">Last used</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className={`border-b last:border-0 ${k.revoked_at ? 'opacity-50' : ''}`}>
                      <td className="py-3 pr-4 font-medium">{k.name}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{k.key_prefix}…</td>
                      <td className="py-3 pr-4">{k.scopes.join(', ')}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(k.created_at)}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{k.last_used_at ? formatDateTime(k.last_used_at) : 'never'}</td>
                      <td className="py-3 text-right">
                        {k.revoked_at ? (
                          <span className="text-xs text-muted-foreground">Revoked</span>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => revoke(k.id)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
