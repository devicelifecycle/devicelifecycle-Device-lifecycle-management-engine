'use client'

// ============================================================================
// VAR TEAM — manage delegated-role reps within one VAR tenant
// ============================================================================
// A VAR Entity Admin manages the whole tenant's team (regional managers +
// sales reps); a Regional Manager manages only sales reps in their own
// region. The API (GET/POST /api/var/team) enforces the same scoping
// server-side via canManageVarTeamMember — this page just reflects it.

import { useEffect, useState } from 'react'
import { UserCog, Plus, Loader2, X, KeyRound, Ban, RotateCcw, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

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

export default function VarTeamPageImpl() {
  const { user } = useAuth()
  // user.role/secondary_role are typed to the 6 core UserRole values (the
  // delegated VAR roles are a newer, wider AppRole) — compare as strings
  // rather than widen that shared type across every other place it's used.
  const isEntityAdmin = String(user?.role) === 'var_entity_admin' || String(user?.secondary_role) === 'var_entity_admin'

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [regionTarget, setRegionTarget] = useState<TeamMember | null>(null)
  // Distinct regions on the visible roster — used to suggest exact spellings.
  const knownRegions = [...new Set(members.map((m) => m.region).filter((r): r is string => !!r))].sort()

  // POST .../[id] { action: 'reassign_region' } existed server-side with no UI
  // control, so the capability was unreachable from the console.
  const reassignRegion = async (member: TeamMember, nextRegion: string) => {
    try {
      const res = await fetch(`/api/var/team/${member.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reassign_region', region: nextRegion.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Could not move this team member'); return }
      toast.success(nextRegion.trim()
        ? `${member.full_name} moved to ${nextRegion.trim()}`
        : `${member.full_name}'s region cleared`)
      setRegionTarget(null)
      load()
    } catch {
      toast.error('Could not move this team member')
    }
  }
  const [formOpen, setFormOpen] = useState(false)

  const load = () => {
    setLoading(true)
    setDenied(false)
    fetch('/api/var/team')
      .then(async (r) => {
        // A sales rep can reach /var but not the team roster. Without this the
        // 403 fell through to an empty array and rendered as "No team members
        // yet" — indistinguishable from a genuinely empty team.
        if (r.status === 403) { setDenied(true); return null }
        return r.ok ? r.json() : null
      })
      .then((d: { data?: TeamMember[] } | null) => setMembers(d?.data ?? []))
      .catch(() => toast.error('Could not load your team'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const act = async (id: string, action: 'disable' | 'reactivate' | 'reset_password') => {
    try {
      const res = await fetch(`/api/var/team/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Could not update team member'); return }
      if (action === 'reset_password') {
        if (data.emailSentTo) {
          toast.success(`New password emailed to ${data.emailSentTo}`)
        } else if (data.tempPassword) {
          // No email on file -- surface the password instead of discarding
          // it, or the rep is locked out with no way to recover it.
          toast.success(`Password reset. No email on file -- new temporary password: ${data.tempPassword}`, { duration: Infinity })
        } else {
          toast.success('Password reset')
        }
      } else {
        toast.success(action === 'disable' ? 'Team member disabled' : 'Team member reactivated')
      }
      load()
    } catch {
      toast.error('Could not update team member')
    }
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
        <AddTeamMemberForm
          isEntityAdmin={isEntityAdmin}
          knownRegions={knownRegions}
          onDone={() => { setFormOpen(false); load() }}
        />
      )}

      {regionTarget && (
        <ReassignRegionDialog
          member={regionTarget}
          knownRegions={knownRegions}
          onClose={() => setRegionTarget(null)}
          onSubmit={(next) => reassignRegion(regionTarget, next)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
          <CardDescription>{members.length} {members.length === 1 ? 'person' : 'people'}.</CardDescription>
        </CardHeader>
        <CardContent>
          {denied ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Your role doesn&apos;t include team management. Ask an entity admin or your regional manager if you need access.
            </p>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : members.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">No team members yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Add regional managers and sales reps here. Everyone you add only sees their own scope &mdash; a sales rep sees the customers assigned to them, a regional manager sees their whole region.
              </p>
            </div>
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
                          <Button type="button" variant="ghost" size="icon" title="Move to another region" onClick={() => setRegionTarget(m)}>
                            <MapPin className="h-4 w-4" />
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

function ReassignRegionDialog({ member, knownRegions, onClose, onSubmit }: {
  member: TeamMember
  knownRegions: string[]
  onClose: () => void
  onSubmit: (nextRegion: string) => Promise<void>
}) {
  const [region, setRegion] = useState(member.region ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try { await onSubmit(region) } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to another region</DialogTitle>
          <DialogDescription>
            {member.full_name} is currently in {member.region ? `"${member.region}"` : 'no region'}. A regional
            manager can only move someone within their own region.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">Region</Label>
          <Input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Leave blank to clear"
            list="var-team-regions-move"
          />
          <datalist id="var-team-regions-move">
            {knownRegions.map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
        <div className="flex justify-end gap-2 pb-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Move
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddTeamMemberForm({ isEntityAdmin, knownRegions, onDone }: {
  isEntityAdmin: boolean
  /** Regions already in use on this team — a regional manager's own region is
   *  necessarily among them, since their roster is scoped to it. */
  knownRegions: string[]
  onDone: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ManagedRole>(isEntityAdmin ? 'var_regional_manager' : 'var_sales_rep')
  // A non-entity-admin can only ever create in their own region, so when the
  // roster reveals exactly one, prefill it instead of asking them to retype it.
  const [region, setRegion] = useState(!isEntityAdmin && knownRegions.length === 1 ? knownRegions[0] : '')
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
      if (data.emailSent) {
        toast.success(`Invite sent to ${data.emailSentTo}`)
      } else if (data.tempPassword) {
        // No email on file to notify -- the temp password would otherwise be
        // generated and silently discarded, permanently locking the new rep
        // out. Surface it so the admin can hand it off some other way.
        toast.success(`Team member created. No email on file -- temporary password: ${data.tempPassword}`, { duration: Infinity })
      } else {
        toast.success('Team member created')
      }
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
            {/* Region is matched EXACTLY server-side, so "Ontario" is rejected
                where the stored value is "ON". Offer the regions already in use
                rather than leaving the user to guess the exact spelling. */}
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. ON, BC, Northeast"
              list="var-team-regions"
            />
            <datalist id="var-team-regions">
              {knownRegions.map((r) => <option key={r} value={r} />)}
            </datalist>
            {!isEntityAdmin && knownRegions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Must match your own region exactly{knownRegions.length === 1 ? `: "${knownRegions[0]}"` : ''}.
              </p>
            )}
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
