// ============================================================================
// FORGOT PASSWORD PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail, ArrowLeft, Package } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const supabase = createBrowserSupabaseClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })

      if (resetError) {
        throw resetError
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-muted/30 via-background to-muted/50 px-4">
        <Card className="w-full max-w-md shadow-xl border-0 animate-fade-in">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10">
              <Mail className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Check Your Email</h2>
              <p className="text-sm text-muted-foreground mt-2">
                If an account exists for{' '}
                <span className="font-medium text-foreground">{email}</span>,
                you&apos;ll receive a password reset link shortly.
              </p>
            </div>
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-muted/30 via-background to-muted/50 px-4">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Package className="h-6 w-6" />
        </div>
        <span className="text-xl font-bold tracking-tight">Enterprise Engine</span>
      </Link>
      <Card className="w-full max-w-md shadow-xl border-0 animate-fade-in">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a reset link
        </CardDescription>
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
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
