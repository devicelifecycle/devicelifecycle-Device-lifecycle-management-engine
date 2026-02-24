// ============================================================================
// PROFILE PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import { User, Mail, Shield, Clock, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { USER_ROLE_CONFIG } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'

export default function ProfilePage() {
  const { user, refetch } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fullName, setFullName] = useState(user?.full_name || '')

  const handleSave = async () => {
    if (!user) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      })
      if (!res.ok) throw new Error()
      toast.success('Profile updated')
      setIsEditing(false)
      refetch()
    } catch {
      toast.error('Failed to update profile')
    } finally { setIsSaving(false) }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const roleConfig = USER_ROLE_CONFIG[user.role]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-2xl font-bold shadow-lg">
            {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <CardTitle>{user.full_name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
          <Badge variant="outline" className="capitalize">
            {roleConfig?.label || user.role}
          </Badge>
        </CardHeader>
      </Card>

      {/* Edit Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Account Details</CardTitle>
            <CardDescription>Your personal information</CardDescription>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => { setFullName(user.full_name || ''); setIsEditing(true) }}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5" />Full Name
              </Label>
              {isEditing ? (
                <Input value={fullName} onChange={e => setFullName(e.target.value)} />
              ) : (
                <p className="font-medium">{user.full_name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />Email
              </Label>
              <p className="font-medium">{user.email}</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />Role
              </Label>
              <p className="font-medium capitalize">{roleConfig?.label || user.role}</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />Last Login
              </Label>
              <p className="font-medium">{user.last_login_at ? formatDateTime(user.last_login_at) : 'N/A'}</p>
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving || !fullName.trim()}>
                <Save className="mr-2 h-4 w-4" />{isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={user.is_active ? 'default' : 'secondary'}>
              {user.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-muted-foreground">Member Since</span>
            <span className="text-sm font-medium">{formatDateTime(user.created_at)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
