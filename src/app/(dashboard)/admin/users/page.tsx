// ============================================================================
// ADMIN - USER MANAGEMENT PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Shield, Pencil, UserX, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
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
import { USER_ROLE_CONFIG } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'
import type { User, UserRole } from '@/types'

const roles: UserRole[] = ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer', 'vendor']

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'sales' as UserRole, password: '' })

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', role: '' as UserRole })
  const [saving, setSaving] = useState(false)

  // Deactivate state
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) { const data = await res.json(); setUsers(data.data || []) }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('User created')
      setDialogOpen(false)
      setForm({ full_name: '', email: '', role: 'sales', password: '' })
      fetchUsers()
    } catch { toast.error('Failed to create user') }
    finally { setCreating(false) }
  }

  const handleOpenEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({ full_name: user.full_name, role: user.role })
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
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
              <div className="space-y-2"><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r} value={r}>{USER_ROLE_CONFIG[r].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !form.full_name || !form.email || !form.password}>{creating ? 'Creating...' : 'Create User'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>All Users ({users.length})</CardTitle></CardHeader>
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
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} className={!u.is_active ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${roleColors[u.role] || ''}`}>
                        {USER_ROLE_CONFIG[u.role]?.label || u.role}
                      </span>
                    </TableCell>
                    <TableCell><Badge variant={u.is_active ? 'default' : 'secondary'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(u)}
                          title="Edit user"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeactivateTarget(u)}
                          title={u.is_active ? 'Deactivate user' : 'Reactivate user'}
                        >
                          {u.is_active
                            ? <UserX className="h-4 w-4 text-destructive" />
                            : <UserCheck className="h-4 w-4 text-green-600" />
                          }
                        </Button>
                      </div>
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
