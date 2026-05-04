// ============================================================================
// RESET PASSWORD PAGE
// ============================================================================

'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Loader2, CheckCircle2, Eye, EyeOff, Package, KeyRound } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

// Password must be 12+ chars, with uppercase, lowercase, number, and special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/

type SessionState = 'checking' | 'valid' | 'invalid'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  // Supabase client is created lazily inside the component — never at module scope —
  // so a misconfigured env in production doesn't crash the module on load.
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null)

  function getSupabase() {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserSupabaseClient()
    }
    return supabaseRef.current
  }

  useEffect(() => {
    let cancelled = false

    const supabase = getSupabase()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (cancelled) return
        if (event === 'PASSWORD_RECOVERY') {
          setSessionState('valid')
        } else if (event === 'SIGNED_IN' && session) {
          setSessionState('valid')
        } else if (event === 'INITIAL_SESSION') {
          if (session) {
            setSessionState('valid')
          }
          // If INITIAL_SESSION fires with no session, wait for PASSWORD_RECOVERY
          // (which fires slightly after for PKCE recovery links)
        }
      }
    )

    // Fallback: if no auth event resolves in 5 s (slow network, no recovery token),
    // mark the session as invalid and redirect to forgot-password.
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setSessionState(prev => prev === 'checking' ? 'invalid' : prev)
    }, 5000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      window.clearTimeout(fallbackTimer)
    }
  }, []) // intentional: runs once on mount only — supabase client is stable

  // Redirect if session check resolves as invalid
  useEffect(() => {
    if (sessionState === 'invalid') {
      router.replace('/forgot-password?reason=expired')
    }
  }, [sessionState, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (sessionState !== 'valid') {
      setError('Invalid or expired reset link. Please request a new password reset.')
      return
    }

    if (!PASSWORD_REGEX.test(password)) {
      setError('Password must be at least 12 characters and include uppercase, lowercase, number, and special character')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      const supabase = getSupabase()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // Fire-and-forget confirmation email
      fetch('/api/users/password-change-confirmation', { method: 'POST' }).catch(() => {})

      await supabase.auth.signOut()
      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-xl animate-fade-in">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-green-500/10">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Password Updated</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Your password has been successfully reset. Redirecting to sign in&hellip;
              </p>
            </div>
            <Link href="/login" className="block">
              <Button variant="outline" className="w-full mt-2">Go to Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Checking / loading state ─────────────────────────────────────────────
  if (sessionState === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-xl animate-fade-in">
          <CardContent className="pt-10 pb-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              <KeyRound className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Verifying Reset Link</h2>
              <p className="text-sm text-muted-foreground">
                Please wait while we verify your password reset link&hellip;
              </p>
            </div>
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Form (session is valid) ──────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8 flex items-center gap-3 text-foreground">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Package className="h-6 w-6" />
        </div>
        <span className="text-xl font-bold tracking-tight">DLM Engine</span>
      </Link>
      <Card className="w-full max-w-md shadow-xl animate-fade-in">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                New Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                12+ characters — uppercase, lowercase, number, and special character
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="h-11"
              />
            </div>

            <Button type="submit" className="w-full h-11 shadow-md shadow-primary/20" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting password...</>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-center text-sm pb-6">
          <Link href="/login" className="text-primary font-medium hover:underline">
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
