// ============================================================================
// LOGIN PAGE
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Package, Eye, EyeOff, Loader2, ShoppingCart, Brain, Truck, CheckCircle2, BarChart3, Shield } from 'lucide-react'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const { login, isLoading } = useAuth()

  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') {
      setSessionExpired(true)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await login(email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in'
      if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid email or password')) {
        setError('Invalid email or password. If this is your first time, you may need to create a user in Supabase Dashboard → Authentication → Users.')
      } else {
        setError(msg)
      }
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side - Marketing Showcase */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-teal-600 via-emerald-700 to-teal-800 animate-gradient-shift text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-glow" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-400/15 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 animate-glow" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-cyan-400/8 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
              <Package className="h-6 w-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">DLM Engine</span>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold leading-tight animate-fade-in">
                Device Lifecycle<br />
                Management, Simplified.
              </h1>
              <p className="text-lg text-teal-100 max-w-md animate-fade-in animate-stagger-1">
                The all-in-one platform for ITAD operations. From trade-in to delivery,
                powered by AI pricing and real-time tracking.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-3 animate-fade-in animate-stagger-2">
              <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-3 border border-white/10 hover:bg-white/15 transition-colors">
                <ShoppingCart className="h-5 w-5 text-teal-200 flex-shrink-0" />
                <span className="text-sm font-medium">Order Management</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-3 border border-white/10 hover:bg-white/15 transition-colors">
                <Brain className="h-5 w-5 text-teal-200 flex-shrink-0" />
                <span className="text-sm font-medium">AI Pricing</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-3 border border-white/10 hover:bg-white/15 transition-colors">
                <Truck className="h-5 w-5 text-teal-200 flex-shrink-0" />
                <span className="text-sm font-medium">COE Workflows</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-3 border border-white/10 hover:bg-white/15 transition-colors">
                <BarChart3 className="h-5 w-5 text-teal-200 flex-shrink-0" />
                <span className="text-sm font-medium">Live Analytics</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-3 border border-white/10 hover:bg-white/15 transition-colors">
                <Shield className="h-5 w-5 text-teal-200 flex-shrink-0" />
                <span className="text-sm font-medium">Role-Based Access</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-3 border border-white/10 hover:bg-white/15 transition-colors">
                <CheckCircle2 className="h-5 w-5 text-teal-200 flex-shrink-0" />
                <span className="text-sm font-medium">SLA Monitoring</span>
              </div>
            </div>

            {/* How it works flow */}
            <div className="animate-fade-in animate-stagger-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-300/80 mb-3">How it works</p>
              <div className="flex items-center gap-2">
                {['Submit Order', 'AI Pricing', 'COE Process', 'Delivery'].map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">{i + 1}</span>
                      {step}
                    </div>
                    {i < 3 && <div className="w-4 h-px bg-white/30" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-8 animate-fade-in animate-stagger-4">
              <div>
                <div className="text-2xl font-bold">40+</div>
                <div className="text-xs text-teal-200">Devices</div>
              </div>
              <div>
                <div className="text-2xl font-bold">4</div>
                <div className="text-xs text-teal-200">Pricing Models</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Real-time</div>
                <div className="text-xs text-teal-200">Tracking</div>
              </div>
            </div>
          </div>

          <p className="text-sm text-teal-200/90">
            © {new Date().getFullYear()} DLM Engine. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-muted/30">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Package className="h-6 w-6" />
            </div>
            <span className="text-xl font-bold">DLM Engine</span>
          </div>

          <Card className="border-0 shadow-xl shadow-black/5 ring-1 ring-black/5">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <CardDescription className="text-base">
                Enter your credentials to access the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {sessionExpired && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400">
                    Your session has expired. Please sign in again.
                  </div>
                )}
                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive animate-scale-in">
                    {error}
                  </div>
                )}
                
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex-col gap-3 pt-2 pb-6">
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-medium text-primary hover:underline">
                  Request access
                </Link>
              </p>
            </CardFooter>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            First time? Create users in Supabase Dashboard → Authentication → Users, then link them in the <code className="rounded bg-muted px-1 py-0.5">users</code> table. See <code className="rounded bg-muted px-1 py-0.5">supabase/SETUP_INSTRUCTIONS.md</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
