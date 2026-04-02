// ============================================================================
// PROFILE PAGE
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Lock, Mail, Save, Shield, Smartphone, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { USER_ROLE_CONFIG } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'

function ChangePasswordCard({ authEmail }: { authEmail: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChanging, setIsChanging] = useState(false)

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setIsChanging(true)
    try {
      const supabase = createBrowserSupabaseClient()
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: currentPassword,
      })
      if (signInError) {
        toast.error('Current password is incorrect')
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      // Send confirmation email (fire-and-forget; only sent for real emails, not @login.local)
      fetch('/api/users/password-change-confirmation', { method: 'POST' }).catch(() => {})
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to change password')
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4" /> Change Password
        </CardTitle>
        <CardDescription>Update your password. You will need your current password.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Current password</Label>
          <Input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-2">
          <Label>New password</Label>
          <Input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label>Confirm new password</Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
        </div>
        <Button
          onClick={handleChangePassword}
          disabled={
            isChanging ||
            !currentPassword ||
            !newPassword ||
            !confirmPassword ||
            newPassword.length < 8
          }
        >
          {isChanging ? 'Changing...' : 'Change Password'}
        </Button>
      </CardContent>
    </Card>
  )
}

function MfaCard() {
  const { enrollMfa, unenrollMfa, getMfaFactors } = useAuth()
  const supabase = createBrowserSupabaseClient()
  type TotpFactor = { id: string; friendly_name?: string; status: string }
  const [factors, setFactors] = useState<TotpFactor[]>([])
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [pendingFactorId, setPendingFactorId] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [fetchedOnce, setFetchedOnce] = useState(false)

  useEffect(() => {
    getMfaFactors()
      .then((data) => {
        const totp = (data?.totp ?? []) as TotpFactor[]
        setFactors(totp.filter((f) => f.status === 'verified'))
        setFetchedOnce(true)
      })
      .catch(() => setFetchedOnce(true))
  }, [getMfaFactors])

  const startEnroll = async () => {
    setIsLoading(true)
    try {
      const data = await enrollMfa()
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setPendingFactorId(data.id)
      setEnrolling(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start enrollment')
    } finally {
      setIsLoading(false)
    }
  }

  const confirmEnroll = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pendingFactorId,
        code: verifyCode,
      })
      if (error) throw error
      toast.success('Authenticator app connected')
      setEnrolling(false)
      setQrCode('')
      setSecret('')
      setVerifyCode('')
      const data = await getMfaFactors()
      const totp = (data?.totp ?? []) as TotpFactor[]
      setFactors(totp.filter((f) => f.status === 'verified'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid code — please try again')
    } finally {
      setIsLoading(false)
    }
  }

  const removeFactor = async (factorId: string) => {
    setIsLoading(true)
    try {
      await unenrollMfa(factorId)
      toast.success('Authenticator removed')
      setFactors((prev) => prev.filter((f) => f.id !== factorId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove')
    } finally {
      setIsLoading(false)
    }
  }

  if (!fetchedOnce) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4" /> Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Add an authenticator app for an extra layer of security on sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {factors.length === 0 && !enrolling && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No authenticator app connected. Set one up to require a one-time code when you sign in.
            </p>
            <Button onClick={startEnroll} disabled={isLoading} variant="outline">
              {isLoading ? 'Loading...' : 'Set up Authenticator'}
            </Button>
          </div>
        )}

        {enrolling && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the 6-digit code below.
            </p>
            <div className="flex justify-center">
              {/* qr_code is an SVG string from Supabase */}
              <div
                className="h-48 w-48 rounded-lg border p-2 bg-white"
                dangerouslySetInnerHTML={{ __html: qrCode }}
              />
            </div>
            <div className="rounded-lg bg-muted px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Can&apos;t scan? Enter this key manually:</p>
              <p className="text-sm font-mono font-medium break-all select-all">{secret}</p>
            </div>
            <div className="space-y-2">
              <Label>Verification Code</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={confirmEnroll} disabled={isLoading || verifyCode.length !== 6}>
                {isLoading ? 'Verifying...' : 'Confirm Setup'}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setEnrolling(false); setQrCode(''); setSecret(''); setVerifyCode('') }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {factors.length > 0 && !enrolling && (
          <div className="space-y-3">
            {factors.map((factor) => (
              <div key={factor.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Authenticator App</p>
                    <p className="text-xs text-muted-foreground">
                      {factor.friendly_name ?? 'TOTP — active'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeFactor(factor.id)}
                  disabled={isLoading}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ProfilePage() {
  const { user, refetch } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [notificationEmail, setNotificationEmail] = useState(user?.notification_email ?? '')

  const isLoginIdUser = user?.email?.endsWith('@login.local')

  const handleSave = async () => {
    if (!user) return
    setIsSaving(true)
    try {
      const payload: Record<string, string | null> = { full_name: fullName }
      if (isLoginIdUser) {
        payload.notification_email = notificationEmail.trim() || null
      }
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
            <CardDescription>
            {user.email?.endsWith('@login.local') ? user.email.slice(0, -12) : user.email}
          </CardDescription>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFullName(user.full_name || '')
                setNotificationEmail(user.notification_email ?? '')
                setIsEditing(true)
              }}
            >
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
                <Mail className="h-3.5 w-3.5" />
                {user.email?.endsWith('@login.local') ? 'Login ID' : 'Email'}
              </Label>
              <p className="font-medium">
                {user.email?.endsWith('@login.local') ? user.email.slice(0, -12) : user.email}
              </p>
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
            {isLoginIdUser && (
              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />Notification Email
                </Label>
                {isEditing ? (
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={notificationEmail}
                    onChange={e => setNotificationEmail(e.target.value)}
                  />
                ) : (
                  <p className="font-medium">{user.notification_email || '— Not set (emails will not be sent)'}</p>
                )}
                {isLoginIdUser && (
                  <p className="text-xs text-muted-foreground">
                    Add your real email to receive order updates, password reset, and other notifications.
                  </p>
                )}
              </div>
            )}
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

      {/* Change Password */}
      <ChangePasswordCard authEmail={user.email!} />

      {/* Two-Factor Authentication — admin and COE managers only */}
      {(user.role === 'admin' || user.role === 'coe_manager') && (
        <MfaCard />
      )}

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
