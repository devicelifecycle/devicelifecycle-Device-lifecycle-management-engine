// ============================================================================
// FORGOT PASSWORD PAGE
// Two methods: magic link (email) or 6-digit verification code (OTP)
// ============================================================================

'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Mail, ArrowLeft, Package, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

type Method = 'link' | 'otp'
type OtpStep = 'email' | 'code'

function ForgotPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [method, setMethod] = useState<Method>('otp')
  const [email, setEmail] = useState('')
  const [otpStep, setOtpStep] = useState<OtpStep>('email')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expiredNotice, setExpiredNotice] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null)

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createBrowserSupabaseClient()
    return supabaseRef.current
  }

  useEffect(() => {
    if (searchParams.get('reason') === 'expired') setExpiredNotice(true)
  }, [searchParams])

  // ── Send magic link ──────────────────────────────────────────────────────
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && data.error) throw new Error(data.error)
      setLinkSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Send OTP code ────────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to send code')
      }
      setOtpStep('code')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Verify OTP code ──────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmedCode = code.trim().replace(/\s/g, '')
    if (trimmedCode.length !== 6) {
      setError('Please enter the 6-digit code from your email.')
      return
    }
    setIsLoading(true)
    try {
      const supabase = getSupabase()
      // Use the actual email (not Login ID) for OTP verification
      const realEmail = email.trim().includes('@') ? email.trim() : `${email.trim()}@login.local`
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: realEmail,
        token: trimmedCode,
        type: 'recovery',
      })
      if (verifyError) throw verifyError
      // Session is now established — navigate to reset-password
      router.push('/reset-password')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code'
      setError(msg.toLowerCase().includes('otp') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('expired')
        ? 'This code is invalid or has expired. Please request a new one.'
        : msg)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Link sent success state ──────────────────────────────────────────────
  if (linkSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-xl animate-fade-in">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10">
              <Mail className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Check Your Email</h2>
              <p className="text-sm text-muted-foreground mt-2">
                If an account exists for{' '}
                <span className="font-medium text-foreground">{email}</span>,
                you&apos;ll receive a password reset link shortly.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Didn&apos;t get it? Check your spam folder or{' '}
              <button className="underline underline-offset-2 text-primary hover:text-primary/80" onClick={() => setLinkSent(false)}>
                try again
              </button>.
            </p>
            <Link href="/login" className="block">
              <Button variant="outline" className="w-full mt-2">
                <ArrowLeft className="mr-2 h-4 w-4" />Back to Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8 flex items-center gap-3 text-foreground">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Package className="h-5 w-5" />
        </div>
        <span className="text-xl font-bold tracking-tight">DLM Engine</span>
      </Link>

      <Card className="w-full max-w-md shadow-xl animate-fade-in">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <CardDescription>Choose how you&apos;d like to reset your password</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {expiredNotice && (
            <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⏱</span>
              <span>Your reset link has expired. Use the verification code method below for a more reliable experience.</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Method toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted">
            <button
              type="button"
              onClick={() => { setMethod('otp'); setError(''); setOtpStep('email'); setCode('') }}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${method === 'otp' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <ShieldCheck className="h-4 w-4" />
              Verification Code
            </button>
            <button
              type="button"
              onClick={() => { setMethod('link'); setError(''); setOtpStep('email') }}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${method === 'link' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Mail className="h-4 w-4" />
              Email Link
            </button>
          </div>

          {/* OTP method */}
          {method === 'otp' && (
            <>
              {otpStep === 'email' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Enter your email and we&apos;ll send you a 6-digit verification code.
                  </p>
                  <div className="space-y-2">
                    <label htmlFor="otp-email" className="text-sm font-medium">Email or Login ID</label>
                    <Input
                      id="otp-email"
                      type="text"
                      placeholder="you@example.com or your-login-id"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-11"
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 shadow-md shadow-primary/20" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending code...</> : 'Send Verification Code'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>A 6-digit code was sent to <strong>{email}</strong>. Enter it below.</span>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="otp-code" className="text-sm font-medium">Verification Code</label>
                    <Input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      placeholder="123456"
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      autoComplete="one-time-code"
                      className="h-11 text-center text-xl tracking-widest font-mono"
                      maxLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 shadow-md shadow-primary/20" disabled={isLoading || code.length !== 6}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : <><KeyRound className="mr-2 h-4 w-4" />Verify & Set New Password</>}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                      onClick={() => { setOtpStep('email'); setCode(''); setError('') }}
                    >
                      Use a different email or resend code
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* Link method */}
          {method === 'link' && (
            <form onSubmit={handleSendLink} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We&apos;ll send a reset link to your email. Click it to set a new password.
              </p>
              <div className="space-y-2">
                <label htmlFor="link-email" className="text-sm font-medium">Email or Login ID</label>
                <Input
                  id="link-email"
                  type="text"
                  placeholder="you@example.com or your-login-id"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11 shadow-md shadow-primary/20" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending link...</> : 'Send Reset Link'}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-2 text-center text-sm pb-6">
          <Link href="/login" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <ForgotPasswordForm />
    </Suspense>
  )
}
