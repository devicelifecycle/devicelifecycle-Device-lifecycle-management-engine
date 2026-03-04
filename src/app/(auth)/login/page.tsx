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
      {/* Left - Bento showcase */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-teal-600 via-emerald-700 to-teal-800 animate-gradient-shift text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-glow" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-400/15 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 animate-glow" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.05, rotate: 5 }} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
              <Package className="h-6 w-6" />
            </motion.div>
            <span className="font-heading text-xl font-bold tracking-tight">DLM Engine</span>
          </motion.div>

          <div className="space-y-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
              <h1 className="font-heading text-4xl font-bold leading-tight">
                Device Lifecycle<br />
                <span className="text-teal-100">Management, Simplified.</span>
              </h1>
              <p className="text-lg text-teal-100 max-w-md">
                The all-in-one platform for ITAD operations. From trade-in to delivery,
                powered by AI pricing and real-time tracking.
              </p>
            </motion.div>

            <div className="grid grid-cols-4 gap-3 max-w-lg">
              {bentoTiles.map((tile, i) => (
                <motion.div
                  key={tile.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  whileHover={{ scale: 1.03, y: -4 }}
                  className={`${tile.className} flex flex-col justify-center rounded-2xl bg-white/10 backdrop-blur-sm p-4 border border-white/10 hover:bg-white/15 hover:border-white/20 cursor-default transition-all`}
                >
                  <tile.icon className="h-8 w-8 text-teal-200 mb-2" />
                  <span className="text-sm font-semibold">{tile.label}</span>
                  {tile.className.includes('row-span-2') && (
                    <span className="text-xs text-teal-200/90 mt-1">Trade-in & CPO</span>
                  )}
                </motion.div>
              ))}
            </div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex gap-8">
              <div>
                <motion.div className="font-heading text-2xl font-bold" whileHover={{ scale: 1.1 }}>40+</motion.div>
                <div className="text-xs text-teal-200">Devices</div>
              </div>
              <div>
                <motion.div className="font-heading text-2xl font-bold" whileHover={{ scale: 1.1 }}>4</motion.div>
                <div className="text-xs text-teal-200">Pricing Models</div>
              </div>
              <div>
                <motion.div className="font-heading text-2xl font-bold" whileHover={{ scale: 1.1 }}>Real-time</motion.div>
                <div className="text-xs text-teal-200">Tracking</div>
              </div>
            </motion.div>
          </div>

          <p className="text-sm text-teal-200/90">© {new Date().getFullYear()} DLM Engine.</p>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-mesh bg-muted/20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px]"
        >
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-3 group">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Package className="h-6 w-6" />
              </motion.div>
              <span className="font-heading text-xl font-bold">DLM Engine</span>
            </Link>
            <Link href="/">
              <motion.span whileHover={{ x: -4 }} className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                ← Back to home
              </motion.span>
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-0 shadow-2xl shadow-black/15 bg-card/95 backdrop-blur-xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
              <CardHeader className="space-y-1 pb-4 relative">
                <CardTitle className="font-heading text-2xl font-bold">Welcome back</CardTitle>
                <CardDescription className="text-base">Enter your credentials to access the platform</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {sessionExpired && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400"
                    >
                      Your session has expired. Please sign in again.
                    </motion.div>
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
                        className="h-11 pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                        required
                      />
                      <motion.button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </motion.button>
                    </div>
                  </div>

                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button type="submit" className="w-full h-11 text-base font-semibold btn-glow" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </Button>
                  </motion.div>
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
                <p className="text-sm text-muted-foreground text-center">
                  Don&apos;t have an account?{' '}
                  <Link href="/register">
                    <motion.span whileHover={{ x: 2 }} className="font-medium text-primary hover:underline inline-block cursor-pointer">
                      Request access
                    </motion.span>
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
