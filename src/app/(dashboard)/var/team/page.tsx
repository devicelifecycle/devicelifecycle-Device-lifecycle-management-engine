'use client'

// ============================================================================
// VAR TEAM — manage delegated-role reps within one VAR tenant
// ============================================================================
// A VAR Entity Admin manages the whole tenant's team (regional managers +
// sales reps); a Regional Manager manages only sales reps in their own
// region. The API (GET/POST /api/var/team) enforces the same scoping
// server-side via canManageVarTeamMember — this page just reflects it.

import { useEffect, useState } from 'react'
import { UserCog, Plus, Loader2, X, KeyRound, Ban, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'

type ManagedRole = 'var_regional_manager' | 'var_sales_rep'

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: ManagedRole
  region: string | null
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

const ROLE_LABEL: Record<ManagedRole, string> = {
  var_regional_manager: 'Regional Manager',
  var_sales_rep: 'Sales Rep',
}

export default function VarTeamPage() {
  const { user } = useAuth()
  // user.role/secondary_role are typed to the 6 core UserRole values (the
  // delegated VAR roles are a newer, wider AppRole) — compare as strings
  // rather than widen that shared type across every other place it's used.
  const isEntityAdmin = String(user?.role) === 'var_entity_admin' || String(user?.secondary_role) === 'var_entity_admin'

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/var/team')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: TeamMember[] } | null) => setMembers(d?.data ?? []))
      .catch(() => toast.error('Could not load your team'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const act = async (id: string, action: 'disable' | 'reactivate' | 'reset_password') => {
    const res = await fetch(`/api/var/team/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'Could not update team member'); return }
    if (action === 'reset_password') {
      toast.success(data.emailSentTo ? `New password emailed to ${data.emailSentTo}` : 'Password reset — no email on file to notify')
    } else {
      toast.success(action === 'disable' ? 'Team member disabled' : 'Team member reactivated')
    }
    load()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><UserCog className="h-6 w-6 text-primary" /> Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEntityAdmin ? 'Regional managers and sales reps in your organization.' : 'Sales reps in your region.'}
          </p>
        </div>
        <Button type="button" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
          {formOpen ? 'Cancel' : 'Add team member'}
        </Button>
      </div>

      {formOpen && (
        <AddTeamMemberForm isEntityAdmin={isEntityAdmin} onDone={() => { setFormOpen(false); load() }} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
          <CardDescription>{members.length} {members.length === 1 ? 'person' : 'people'}.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : members.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No team members yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.full_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.email}</TableCell>
                      <TableCell>{ROLE_LABEL[m.role]}</TableCell>
                      <TableCell>{m.region || '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
                          {m.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" title="Reset password" onClick={() => act(m.id, 'reset_password')}>
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          {m.is_active ? (
                            <Button type="button" variant="ghost" size="icon" title="Disable" onClick={() => act(m.id, 'disable')}>
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : (
                            <Button type="button" variant="ghost" size="icon" title="Reactivate" onClick={() => act(m.id, 'reactivate')}>
                              <RotateCcw className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AddTeamMemberForm({ isEntityAdmin, onDone }: { isEntityAdmin: boolean; onDone: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ManagedRole>(isEntityAdmin ? 'var_regional_manager' : 'var_sales_rep')
  const [region, setRegion] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!fullName.trim() || !email.trim()) { toast.error('Name and email/login ID are required'); return }
    if (!isEntityAdmin && !region.trim()) { toast.error('Region is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/var/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          role,
          region: region.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Could not create team member'); return }
      toast.success(data.emailSent ? `Invite sent to ${data.emailSentTo}` : 'Team member created')
      onDone()
    } catch {
      toast.error('Could not create team member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Add a team member</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Lee" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email or login ID</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.com" />
          </div>
          {isEntityAdmin && (
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as ManagedRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="var_regional_manager">Regional Manager</SelectItem>
                  <SelectItem value="var_sales_rep">Sales Rep</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Region {isEntityAdmin ? '(optional for a manager)' : ''}</Label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. ON, BC, Northeast" />
          </div>
        </div>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Create
        </Button>
      </CardContent>
    </Card>
  )
}
