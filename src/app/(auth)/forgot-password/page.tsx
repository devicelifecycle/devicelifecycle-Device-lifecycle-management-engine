// ============================================================================
// FORGOT PASSWORD PAGE
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, Mail, ArrowLeft, Package } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expiredNotice, setExpiredNotice] = useState(false)

  useEffect(() => {
    if (searchParams.get('reason') === 'expired') {
      setExpiredNotice(true)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const input = email.trim()

    try {
      if (input.includes('@')) {
        // Real email — use PKCE via Supabase client
        const supabase = createBrowserSupabaseClient()
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(input, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        })
        if (resetError) throw resetError
      } else {
        // Login ID — use server API to look up notification_email
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: input,
            redirectTo: `${window.location.origin}/reset-password`,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok && data.error) throw new Error(data.error)
      }
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
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
              <button
                className="underline underline-offset-2 text-primary hover:text-primary/80"
                onClick={() => setSuccess(false)}
              >
                try again
              </button>
              .
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
          <CardDescription>
            Enter your email or organization Login ID and we&apos;ll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {expiredNotice && (
              <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">⏱</span>
                <span>Your reset link has expired or is invalid. Enter your email below to get a new one.</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email or Login ID
              </label>
              <Input
                id="email"
                type="text"
                placeholder="you@example.com or your-login-id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11"
              />
            </div>

            <Button type="submit" className="w-full h-11 shadow-md shadow-primary/20" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending reset link...</>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>
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

import { Suspense } from 'react'

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
