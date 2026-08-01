'use client'

// ============================================================================
// ADMIN — ROLES (RBAC) + delegated role assignment
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

interface Role {
  id: string
  key: string
  name: string
  description: string | null
  is_system: boolean
  tenant_name: string | null
  members: number
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [roleKey, setRoleKey] = useState('')
  const [assigning, setAssigning] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/roles')
      if (!res.ok) throw new Error()
      setRoles((await res.json()).data ?? [])
    } catch {
      toast.error('Failed to load roles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const assign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !roleKey) { toast.error('Enter an email and pick a role'); return }
    setAssigning(true)
    try {
      const res = await fetch('/api/admin/user-roles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role_key: roleKey }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to assign role')
      toast.success(`Assigned ${roleKey} to ${email.trim()}`)
      setEmail('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign role')
    } finally {
      setAssigning(false)
    }
  }

  const uniqueRoleKeys = Array.from(new Set(roles.map((r) => r.key)))

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" /> Roles & Access
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">System roles plus delegated VAR roles (Entity Admin / Regional Manager / Sales Rep). Assign a user to a delegated role below.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4" /> Assign a role</CardTitle>
          <CardDescription>The role must belong to the user&apos;s tenant or be a platform role.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={assign} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <div className="space-y-1.5"><Label className="text-xs">User email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rep@acme.com" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={roleKey} onValueChange={setRoleKey}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{uniqueRoleKeys.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={assigning}>{assigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Assign</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Roles</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Role</th><th className="pb-2 pr-4 font-medium">Key</th>
                  <th className="pb-2 pr-4 font-medium">Type</th><th className="pb-2 font-medium text-right">Members</th>
                </tr></thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{r.name}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{r.key}</td>
                      <td className="py-3 pr-4">{r.is_system ? 'System' : (r.tenant_name ?? 'Tenant')}</td>
                      <td className="py-3 text-right tabular-nums">{r.members}</td>
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
