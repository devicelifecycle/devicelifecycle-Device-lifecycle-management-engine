// ============================================================================
// ADMIN - USER MANAGEMENT PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Shield, Pencil, Copy, Send, RadioTower } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
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
import { Switch } from '@/components/ui/switch'
import { USER_ROLE_CONFIG } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'
import type { User, UserRole } from '@/types'

const roles: UserRole[] = ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer', 'vendor']

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'sales' as UserRole, password: '', organization_id: '', notification_email: '' })
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; type: string }>>([])

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', role: '' as UserRole, notification_email: '' })
  const [saving, setSaving] = useState(false)

  // Deactivate state
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [twilioStatus, setTwilioStatus] = useState<{
    configured: boolean
    account_sid: string | null
    phone_number: string | null
  } | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('DLM Engine test message. Twilio is connected and ready to send SMS alerts.')
  const [sendingTestSms, setSendingTestSms] = useState(false)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) { const data = await res.json(); setUsers(data.data || []) }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    fetch('/api/twilio/health')
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.twilio) return
        setTwilioStatus(data.twilio)
      })
      .catch(() => {
        setTwilioStatus(null)
      })
  }, [])

  useEffect(() => {
    if (['customer', 'vendor', 'sales'].includes(form.role)) {
      const typeParam = form.role === 'customer' ? '&type=customer' : form.role === 'vendor' ? '&type=vendor' : ''
      fetch(`/api/organizations?page_size=500${typeParam}`)
        .then(r => r.json())
        .then(d => setOrganizations(d.data || []))
        .catch(() => setOrganizations([]))
    } else {
      setOrganizations([])
    }
  }, [form.role])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const payload = {
        ...form,
        organization_id: form.organization_id || undefined,
        notification_email: form.notification_email || undefined,
      }
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create user')
      }
      toast.success('User created. A confirmation email with username and password has been sent.')
      setDialogOpen(false)
      setForm({ full_name: '', email: '', role: 'sales', password: '', organization_id: '', notification_email: '' })
      fetchUsers()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to create user') }
    finally { setCreating(false) }
  }

  const handleOpenEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({ full_name: user.full_name, role: user.role, notification_email: user.notification_email ?? '' })
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { full_name: editForm.full_name, role: editForm.role }
      if ((editingUser as { email?: string }).email?.endsWith('@login.local')) {
        payload.notification_email = editForm.notification_email?.trim() || null
      }
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success('User updated')
      setEditDialogOpen(false)
      setEditingUser(null)
      fetchUsers()
    } catch { toast.error('Failed to update user') }
    finally { setSaving(false) }
  }

  const handleToggleActive = async (user: User) => {
    try {
      if (user.is_active) {
        // Deactivate via DELETE (soft delete)
        const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        toast.success('User deactivated')
      } else {
        // Reactivate via PATCH
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true }),
        })
        if (!res.ok) throw new Error()
        toast.success('User reactivated')
      }
      setDeactivateTarget(null)
      fetchUsers()
    } catch { toast.error('Failed to update user status') }
  }

  const handleSendTestSms = async () => {
    setSendingTestSms(true)
    try {
      const res = await fetch('/api/twilio/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: testPhone,
          message: testMessage,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send test SMS')
      }

      toast.success(`Test SMS sent to ${data?.destination || 'destination number'}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send test SMS')
    } finally {
      setSendingTestSms(false)
    }
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    coe_manager: 'bg-purple-100 text-purple-700',
    coe_tech: 'bg-blue-100 text-blue-700',
    sales: 'bg-green-100 text-green-700',
    customer: 'bg-orange-100 text-orange-700',
    vendor: 'bg-cyan-100 text-cyan-700',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user accounts and roles</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>Create a new user account with a role assignment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Smith" /></div>
              <div className="space-y-2">
                <Label>Login ID or Email</Label>
                <Input
                  type="text"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="acme or john@acme.com"
                />
                <p className="text-xs text-muted-foreground">
                  <strong>Email:</strong> Enter a real email (e.g. john@acme.com). Credentials are sent there; user logs in with that email. &middot; <strong>Login ID:</strong> Enter an ID (e.g. acme). Provide an email below to send credentials; user signs in with the ID.
                </p>
              </div>
              {!form.email.includes('@') && form.email.length > 0 && (
                <div className="space-y-2">
                  <Label>Email to send credentials</Label>
                  <Input
                    type="email"
                    value={form.notification_email}
                    onChange={e => setForm(f => ({ ...f, notification_email: e.target.value }))}
                    placeholder="user@example.com"
                  />
                  <p className="text-xs text-muted-foreground">Login ID and password will be emailed here. User can also use &quot;Forgot password&quot; to set a new one.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r} value={r}>{USER_ROLE_CONFIG[r].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {['customer', 'vendor', 'sales'].includes(form.role) && (
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Select value={form.organization_id} onValueChange={v => setForm(f => ({ ...f, organization_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                    <SelectContent>
                      {organizations.map(o => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {organizations.length === 0 && <p className="text-xs text-amber-600">Create an organization first</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label>Initial Password</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="User can change after first login" />
                <p className="text-xs text-muted-foreground">User can change this in Profile or use &quot;Forgot password&quot; to set a new one.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={
                  creating ||
                  !form.full_name ||
                  !form.email ||
                  !form.password ||
                  (['customer', 'vendor', 'sales'].includes(form.role) && !form.organization_id) ||
                  (!form.email.includes('@') && !form.notification_email)
                }
              >
                {creating ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <RadioTower className="h-4 w-4 text-primary" />
              Twilio SMS Test
            </CardTitle>
            <CardDescription>
              Admin-only delivery check for the live SMS provider. Send a short message to verify outbound notifications before launch.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={twilioStatus?.configured ? 'default' : 'secondary'}>
              {twilioStatus?.configured ? 'Configured' : 'Not configured'}
            </Badge>
            {twilioStatus?.account_sid ? <Badge variant="secondary">SID {twilioStatus.account_sid}</Badge> : null}
            {twilioStatus?.phone_number ? <Badge variant="secondary">From {twilioStatus.phone_number}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="twilio-test-phone">Destination Phone</Label>
            <Input
              id="twilio-test-phone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+1 604 555 1234"
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio-test-message">Message</Label>
            <Textarea
              id="twilio-test-message"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows={3}
              maxLength={160}
              placeholder="Short delivery-check message"
            />
            <p className="text-xs text-muted-foreground">{testMessage.length}/160 characters</p>
          </div>
          <Button
            onClick={handleSendTestSms}
            disabled={sendingTestSms || !twilioStatus?.configured || !testPhone.trim() || !testMessage.trim()}
            className="md:self-end"
          >
            <Send className="mr-2 h-4 w-4" />
            {sendingTestSms ? 'Sending...' : 'Send Test SMS'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Users ({users.length})</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const ids = users.map(u =>
                u.email?.endsWith('@login.local') ? u.email.slice(0, -12) : u.email
              ).filter(Boolean)
              navigator.clipboard.writeText(ids.join('\n'))
              toast.success(`Copied ${ids.length} Login IDs to clipboard`)
            }}
            disabled={users.length === 0}
          >
            <Copy className="mr-2 h-4 w-4" /> Copy all Login IDs
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground"><Shield className="h-12 w-12 mb-4" /><p>No users found</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Login ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} className={!u.is_active ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="font-mono text-sm">{u.email?.endsWith('@login.local') ? u.email.slice(0, -12) : u.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${roleColors[u.role] || ''}`}>
                        {USER_ROLE_CONFIG[u.role]?.label || u.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span title={u.role === 'admin' ? 'Cannot revoke admin access' : u.is_active ? 'Revoke access' : 'Grant access'}>
                          <Switch
                            checked={u.is_active}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                handleToggleActive(u)
                              } else {
                                setDeactivateTarget(u)
                              }
                            }}
                            disabled={u.role === 'admin'}
                          />
                        </span>
                        <Badge variant={u.is_active ? 'default' : 'secondary'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(u)}
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update {editingUser?.full_name}&apos;s details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r} value={r}>{USER_ROLE_CONFIG[r].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(editingUser as { email?: string })?.email?.endsWith('@login.local') && (
              <div className="space-y-2">
                <Label>Notification Email</Label>
                <Input
                  type="email"
                  value={editForm.notification_email}
                  onChange={e => setEditForm(f => ({ ...f, notification_email: e.target.value }))}
                  placeholder="user@example.com"
                />
                <p className="text-xs text-muted-foreground">Used for order updates and forgot-password.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.full_name}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate/Reactivate Confirmation */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deactivateTarget?.is_active ? 'Deactivate' : 'Reactivate'} User
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.is_active
                ? `Are you sure you want to deactivate ${deactivateTarget?.full_name}? They will no longer be able to log in.`
                : `Are you sure you want to reactivate ${deactivateTarget?.full_name}? They will be able to log in again.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={deactivateTarget?.is_active ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              onClick={() => deactivateTarget && handleToggleActive(deactivateTarget)}
            >
              {deactivateTarget?.is_active ? 'Deactivate' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
