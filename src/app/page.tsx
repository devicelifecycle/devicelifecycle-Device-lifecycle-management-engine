// ============================================================================
// LANDING PAGE — Creative, interactive UI with rich animations
// ============================================================================

'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Package, ShoppingCart, Brain, Truck, BarChart3, Shield, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { FadeInUp, FadeIn, ScaleIn, MotionCard } from '@/components/ui/motion'

const features = [
  { icon: ShoppingCart, title: 'Order Management', desc: 'Trade-in & CPO orders from quote to delivery', gradient: 'from-teal-500/20 to-emerald-500/20', iconBg: 'bg-teal-500/20', hue: 'teal' },
  { icon: Brain, title: 'AI Pricing', desc: 'Multiple pricing models with competitor insights', gradient: 'from-violet-500/20 to-purple-500/20', iconBg: 'bg-violet-500/20', hue: 'violet' },
  { icon: Truck, title: 'COE Workflows', desc: 'Receiving, triage, shipping—fully tracked', gradient: 'from-amber-500/20 to-orange-500/20', iconBg: 'bg-amber-500/20', hue: 'amber' },
  { icon: BarChart3, title: 'Live Analytics', desc: 'Reports, dashboards, and real-time visibility', gradient: 'from-cyan-500/20 to-blue-500/20', iconBg: 'bg-cyan-500/20', hue: 'cyan' },
  { icon: Shield, title: 'Role-Based Access', desc: 'Admins, COE, sales, vendors—secure by role', gradient: 'from-rose-500/20 to-pink-500/20', iconBg: 'bg-rose-500/20', hue: 'rose' },
  { icon: CheckCircle2, title: 'SLA Monitoring', desc: 'Breach alerts and SLA rule configuration', gradient: 'from-emerald-500/20 to-teal-500/20', iconBg: 'bg-emerald-500/20', hue: 'emerald' },
]

export default function LandingPage() {
  const router = useRouter()
  const { isAuthenticated, isInitializing } = useAuth()

  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, isInitializing, router])

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent"
        />
      </div>
    )
  }

  if (isAuthenticated) return null

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-mesh" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-500/12 rounded-full blur-[140px] animate-pulse-soft -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] animate-float translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-violet-500/8 rounded-full blur-[80px] animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background))_70%)]" />
      </div>

      {/* Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex h-16 items-center justify-between px-6 lg:px-12 border-b border-border/50 bg-background/70 backdrop-blur-xl sticky top-0 z-50"
      >
        <Link href="/" className="flex items-center gap-3 group">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.98 }}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/25 group-hover:shadow-teal-500/40 transition-shadow"
          >
            <Package className="h-5 w-5 text-white" />
          </motion.div>
          <span className="font-heading text-lg font-bold tracking-tight">DLM Engine</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <motion.div whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
              <Button variant="ghost" className="font-medium">
                Sign In
              </Button>
            </motion.div>
          </Link>
          <Link href="/login">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex items-center gap-2">
              <Button className="shadow-lg shadow-primary/25 btn-glow font-medium">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          </Link>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="px-6 lg:px-12 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="mx-auto max-w-5xl text-center">
          <FadeInUp className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary mb-8">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Device Lifecycle Management Platform
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="h-2 w-2 rounded-full bg-teal-500"
            />
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
              From trade-in to delivery,
              <br />
              <motion.span
                className="inline-block bg-gradient-to-r from-teal-600 via-emerald-500 to-teal-600 bg-clip-text text-transparent bg-[length:200%_auto]"
                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
              >
                all in one place.
              </motion.span>
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.2}>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              The all-in-one platform for ITAD operations. AI-powered pricing, real-time tracking,
              and end-to-end COE workflows—simplified.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.3}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="flex items-center gap-2 group">
                  <Button size="lg" className="min-w-[180px] h-12 text-base shadow-xl shadow-primary/30 btn-glow">
                    Sign In <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>
              </Link>
              <Link href="/register">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button size="lg" variant="outline" className="min-w-[180px] h-12 text-base border-2">
                    Request Access
                  </Button>
                </motion.div>
              </Link>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Bento grid */}
      <section className="px-6 lg:px-12 pb-24 lg:pb-32">
        <div className="mx-auto max-w-6xl">
          <FadeInUp>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold text-center text-foreground mb-4">
              Everything you need
            </h2>
            <p className="text-center text-muted-foreground mb-12">Powered by AI. Built for scale.</p>
          </FadeInUp>
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item, i) => (
              <FadeInUp key={item.title} delay={i * 0.05}>
                <Link href="/login">
                  <MotionCard delay={i * 0.05} className="group">
                    <div
                      className={`relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br ${item.gradient} p-6 card-hover-lift`}
                    >
                      <motion.div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${item.iconBg} mb-4`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <item.icon className="h-7 w-7 text-foreground/90" />
                      </motion.div>
                      <h3 className="font-heading font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </MotionCard>
                </Link>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 lg:px-12 pb-24 lg:pb-32">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold text-center text-foreground mb-12">
              How it works
            </h2>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {['Submit Order', 'AI Pricing', 'COE Process', 'Delivery'].map((step, i) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-2"
                >
                  <div className="flex items-center gap-2 rounded-xl bg-muted/80 border border-border/50 px-5 py-3 text-sm font-medium hover:border-primary/30 hover:bg-primary/5 transition-all cursor-default">
                    <motion.span
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold"
                      whileHover={{ scale: 1.2, rotate: 360 }}
                      transition={{ duration: 0.5 }}
                    >
                      {i + 1}
                    </motion.span>
                    {step}
                  </div>
                  {i < 3 && <div className="hidden sm:block w-6 h-px bg-border" />}
                </motion.div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 lg:px-12 pb-24">
        <ScaleIn>
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-teal-500/20 via-emerald-500/15 to-teal-500/20 border border-primary/30 p-12 text-center relative overflow-hidden"
          >
            <h2 className="font-heading text-2xl sm:text-4xl font-bold text-foreground mb-3 relative">
              Ready to streamline your ITAD operations?
            </h2>
            <p className="text-muted-foreground mb-8 relative">Sign in or request access to get started.</p>
            <Link href="/login">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button size="lg" className="shadow-lg shadow-primary/30 btn-glow min-w-[200px] relative">
                  Sign In Now
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </ScaleIn>
      </section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="border-t border-border/50 py-8 px-6 lg:px-12"
      >
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">DLM Engine</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} DLM Engine. Device Lifecycle Management Platform.
          </p>
        </div>
      </motion.footer>
    </div>
  )
}
