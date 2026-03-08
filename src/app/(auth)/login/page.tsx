// ============================================================================
// LOGIN PAGE — Interactive, animated UI
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Package, Eye, EyeOff, Loader2, ShoppingCart, Brain, Truck, CheckCircle2, BarChart3, Shield } from 'lucide-react'

const bentoTiles = [
  { icon: ShoppingCart, label: 'Order Management', className: 'col-span-2 row-span-2' },
  { icon: Brain, label: 'AI Pricing', className: 'col-span-2' },
  { icon: Truck, label: 'COE Workflows', className: 'col-span-2' },
  { icon: BarChart3, label: 'Live Analytics', className: 'col-span-2' },
  { icon: Shield, label: 'Role-Based Access', className: 'col-span-2' },
  { icon: CheckCircle2, label: 'SLA Monitoring', className: 'col-span-2' },
]

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
      {/* Left - Enterprise showcase */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-950 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.08)_0%,transparent_50%)]" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <Package className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold text-lg tracking-tight">DLM Engine</span>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="font-semibold text-3xl leading-tight tracking-tight">
                Device Lifecycle Management
              </h1>
              <p className="text-slate-400 max-w-md leading-relaxed">
                Enterprise platform for trade-in to delivery. AI-powered pricing. Built for enterprise teams.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md">
              {bentoTiles.slice(0, 4).map((tile) => (
                <div
                  key={tile.label}
                  className="flex flex-col justify-center rounded-lg bg-slate-900/50 p-4 border border-slate-800"
                >
                  <tile.icon className="h-6 w-6 text-blue-400 mb-2" />
                  <span className="text-sm font-medium">{tile.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-slate-600">© {new Date().getFullYear()} DLM Engine.</p>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-slate-950">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px]"
        >
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-lg">DLM Engine</span>
            </Link>
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
              ← Back to home
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border border-slate-800 bg-slate-900/50 overflow-hidden">
              <CardHeader className="space-y-1 pb-4 relative">
                <CardTitle className="font-heading text-2xl font-bold">Welcome back</CardTitle>
                <CardDescription className="text-base">Enter your credentials to access the platform</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {sessionExpired && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-600 dark:text-amber-400">
                      Your session has expired. Please sign in again.
                    </div>
                  )}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
                    >
                      {error}
                    </motion.div>
                  )}

                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">Email address</label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium">Password</label>
                      <Link href="/forgot-password" className="text-xs text-blue-400 hover:underline">
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
                        className="h-11 pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-11 text-base font-medium bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
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
              <CardFooter className="flex-col gap-3 pt-2 pb-6 relative">
                <div className="relative w-full">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                <p className="text-sm text-slate-400 text-center">
                  Don&apos;t have an account?{' '}
                  <Link href="/register" className="font-medium text-blue-400 hover:text-blue-300 hover:underline">
                    Request access
                  </Link>
                </p>
              </CardFooter>
            </Card>
          </motion.div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
