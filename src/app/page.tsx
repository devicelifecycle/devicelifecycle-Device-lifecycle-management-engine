// ============================================================================
// LANDING PAGE — Cinematic entrance. Trade-in to delivery. Creative flow.
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, ShoppingCart, Brain, Truck, BarChart3, Shield, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { FadeInUp, ScaleIn } from '@/components/ui/motion'

// Device images — phones & laptops (brand-neutral)
const DEVICE_IMAGES = {
  iphoneWhite: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=320&q=90',
  iphoneBlack: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=320&q=90',
  iphoneGold: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=320&q=90',
  macbook: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=480&q=90',
  laptop: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=480&q=90',
}

const features = [
  { icon: ShoppingCart, title: 'Orders', desc: 'Create. Track. Quote to delivery.', color: 'from-amber-500/20 to-orange-500/10', iconColor: 'text-amber-400' },
  { icon: Brain, title: 'AI Pricing', desc: 'Fair quotes. Competitor insights.', color: 'from-violet-500/20 to-fuchsia-500/10', iconColor: 'text-violet-400' },
  { icon: Truck, title: 'COE Workflows', desc: 'Receiving. Triage. Shipping.', color: 'from-cyan-500/20 to-sky-500/10', iconColor: 'text-cyan-400' },
  { icon: BarChart3, title: 'Analytics', desc: 'Dashboards. Reports.', color: 'from-emerald-500/20 to-teal-500/10', iconColor: 'text-emerald-400' },
  { icon: Shield, title: 'Secure Access', desc: 'Right people. Right permissions.', color: 'from-rose-500/20 to-pink-500/10', iconColor: 'text-rose-400' },
  { icon: CheckCircle2, title: 'SLA Alerts', desc: 'Never miss a deadline.', color: 'from-indigo-500/20 to-violet-500/10', iconColor: 'text-indigo-400' },
]

// Floating device with creative entrance
function FloatingDevice({
  src,
  alt,
  type,
  size = 'md',
  delay,
  className = '',
  style,
}: {
  src: string
  alt: string
  type: 'phone' | 'laptop'
  size?: 'sm' | 'md' | 'lg'
  delay: number
  className?: string
  style?: React.CSSProperties
}) {
  const isPhone = type === 'phone'
  const dims = isPhone
    ? (size === 'sm' ? { w: 100, h: 200 } : size === 'lg' ? { w: 150, h: 300 } : { w: 120, h: 240 })
    : (size === 'sm' ? { w: 180, h: 120 } : size === 'lg' ? { w: 280, h: 185 } : { w: 220, h: 145 })

  return (
    <motion.div
      className={`absolute overflow-hidden ${isPhone ? 'rounded-[2rem]' : 'rounded-lg'} shadow-2xl ${className}`}
      style={{
        ...style,
        width: dims.w,
        height: dims.h,
        boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
      }}
      initial={{ opacity: 0, y: 80, scale: 0.5, rotate: -12, filter: 'blur(24px)' }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        rotate: 0,
        filter: 'blur(0px)',
        transition: { delay, duration: 1.4, ease: [0.34, 1.56, 0.64, 1] },
      }}
      whileHover={{
        scale: 1.08,
        y: -8,
        rotate: 2,
        zIndex: 30,
        transition: { type: 'spring', stiffness: 400, damping: 25 },
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={dims.w}
        height={dims.h}
        className={`object-cover w-full h-full ${isPhone ? 'rounded-[2rem]' : 'rounded-lg'}`}
      />
    </motion.div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const { isAuthenticated, isInitializing } = useAuth()
  const [introDone, setIntroDone] = useState(false)

  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, isInitializing, router])

  // Cinematic intro — 2.5s then reveal
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), 2500)
    return () => clearTimeout(t)
  }, [])

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="h-10 w-10 rounded-full border-2 border-cyan-500/60 border-t-transparent"
        />
      </div>
    )
  }

  if (isAuthenticated) return null

  return (
    <div className="min-h-screen bg-[#050508] text-[#fafafa] overflow-hidden">
      {/* Cinematic intro overlay — curtain split reveal */}
      <AnimatePresence>
        {!introDone && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden"
          >
            {/* Cinematic letterbox bars */}
            <motion.div
              initial={{ height: '10vh' }}
              animate={{ height: '8vh' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-x-0 top-0 bg-black/90"
            />
            <motion.div
              initial={{ height: '10vh' }}
              animate={{ height: '8vh' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-x-0 bottom-0 bg-black/90"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ delay: 0.2, duration: 1, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-center relative z-10"
            >
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="flex justify-center mb-6"
              >
                <motion.div
                  animate={{
                    rotate: [0, 3, -3, 0],
                    scale: [1, 1.05, 1],
                    boxShadow: ['0 0 30px -5px rgba(34,211,238,0.3)', '0 0 50px -5px rgba(139,92,246,0.4)', '0 0 30px -5px rgba(34,211,238,0.3)'],
                  }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-500 via-violet-500 to-amber-500 flex items-center justify-center shadow-2xl"
                >
                  <Package className="h-9 w-9 text-white" />
                </motion.div>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 0.8, duration: 0.7 }}
                className="font-heading text-3xl sm:text-4xl font-bold text-white tracking-tight"
              >
                DLM Engine
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.5 }}
                className="text-cyan-400/90 text-xs sm:text-sm mt-2 tracking-[0.35em] uppercase"
              >
                Device Lifecycle Management
              </motion.p>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 1.5, duration: 0.7 }}
                className="h-px bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent mt-8 mx-auto max-w-[220px] origin-center"
              />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
                className="mt-6 flex justify-center gap-2"
              >
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: (i - 1) * 0.2 }}
                    className="h-1.5 w-1.5 rounded-full bg-cyan-400"
                  />
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Creative gradient mesh background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(34,211,238,0.15)_0%,transparent_50%)] animate-aurora-slow" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_85%_20%,rgba(139,92,246,0.12)_0%,transparent_45%)] animate-aurora-slow" style={{ animationDelay: '-3s' }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_15%_80%,rgba(251,191,36,0.1)_0%,transparent_50%)] animate-aurora-slow" style={{ animationDelay: '-6s' }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(34,197,94,0.06)_0%,transparent_45%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(5,5,8,0.7)_70%,#050508_100%)]" />
        {/* Morphing gradient orbs */}
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full opacity-30 blur-[120px] -top-1/4 -left-1/4"
          style={{ background: 'linear-gradient(135deg, rgb(34 211 238 / 0.4), rgb(139 92 246 / 0.3))' }}
          animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full opacity-25 blur-[100px] top-1/2 right-0"
          style={{ background: 'linear-gradient(225deg, rgb(251 191 36 / 0.35), rgb(236 72 153 / 0.2))' }}
          animate={{ x: [0, -40, 0], y: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute inset-0 opacity-[0.02] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')] pointer-events-none" />
      </div>

      {/* Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: introDone ? 1 : 0 }}
        transition={{ delay: 2.6, duration: 0.5 }}
        className="flex h-16 items-center justify-between px-6 sm:px-8 lg:px-12 border-b border-white/5 bg-[#050508]/95 backdrop-blur-xl sticky top-0 z-50"
      >
        <Link href="/" className="flex items-center gap-3 group">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.98 }}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-amber-500 shadow-lg shadow-cyan-500/25"
          >
            <Package className="h-5 w-5 text-white" />
          </motion.div>
          <span className="font-heading text-lg font-bold tracking-tight text-white">DLM Engine</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-white/5 font-medium">
              Sign In
            </Button>
          </Link>
          <Link href="/login">
            <Button className="bg-gradient-to-r from-cyan-500 to-amber-500 hover:from-cyan-400 hover:to-amber-400 text-black font-semibold shadow-lg shadow-cyan-500/25">
              Get Started <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </motion.nav>

      {/* Hero — Cinematic device entrance */}
      <section className="relative px-6 sm:px-8 lg:px-12 pt-20 pb-32 lg:pt-28 lg:pb-44 min-h-[92vh] flex flex-col items-center justify-center">
        {/* Floating devices — phones & laptops */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible">
          <div className="relative w-full max-w-6xl h-[620px] mx-auto">
            {/* Orbit 1 — Phone */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="animate-orbit-slow relative" style={{ width: 300, height: 300 }}>
                <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                  <FloatingDevice src={DEVICE_IMAGES.iphoneWhite} alt="Phone" type="phone" size="md" delay={2.8} className="animate-device-cinematic-float" />
                </div>
              </div>
            </div>
            {/* Orbit 2 — MacBook */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="animate-orbit-reverse relative" style={{ width: 420, height: 420, animationDuration: '32s', animationDelay: '-10s' }}>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
                  <FloatingDevice src={DEVICE_IMAGES.macbook} alt="Laptop" type="laptop" size="md" delay={3.2} className="animate-device-drift" />
                </div>
              </div>
            </div>
            {/* Orbit 3 — Phone accent */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="animate-orbit-slow relative" style={{ width: 240, height: 240, animationDuration: '20s', animationDelay: '-6s' }}>
                <div className="absolute bottom-0 left-0 translate-y-1/2">
                  <FloatingDevice src={DEVICE_IMAGES.iphoneBlack} alt="Phone" type="phone" size="sm" delay={3.5} className="animate-device-float-2" />
                </div>
              </div>
            </div>

            {/* Scattered devices */}
            <div className="absolute top-[12%] right-[6%] animate-device-float-2" style={{ animationDelay: '-2s' }}>
              <FloatingDevice src={DEVICE_IMAGES.laptop} alt="Laptop" type="laptop" size="sm" delay={3.8} />
            </div>
            <div className="absolute bottom-[16%] left-[8%] animate-device-drift" style={{ animationDelay: '-4s' }}>
              <FloatingDevice src={DEVICE_IMAGES.macbook} alt="Laptop" type="laptop" size="sm" delay={4.0} style={{ transform: 'rotate(-15deg)' }} />
            </div>
            <div className="absolute top-[38%] left-[2%] animate-device-float-2" style={{ animationDelay: '-3s' }}>
              <FloatingDevice src={DEVICE_IMAGES.iphoneBlack} alt="Phone" type="phone" size="sm" delay={4.2} />
            </div>
            <div className="absolute top-[44%] right-[2%] animate-device-drift" style={{ animationDelay: '-5s' }}>
              <FloatingDevice src={DEVICE_IMAGES.iphoneGold} alt="Phone" type="phone" size="sm" delay={4.4} style={{ transform: 'rotate(-6deg)', opacity: 0.92 }} />
            </div>
          </div>
        </div>

        {/* Hero content — staggered cinematic reveal */}
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: introDone ? 1 : 0, y: introDone ? 0 : 30, scale: introDone ? 1 : 0.9 }}
            transition={{ delay: 2.5, duration: 0.8, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-amber-500/10 px-5 py-2.5 text-sm font-medium text-white mb-8"
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-amber-300 bg-clip-text text-transparent font-semibold">Trade-in to delivery</span>
            <span className="text-zinc-400 ml-1">· one platform.</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 60, filter: 'blur(16px)' }}
            animate={{
              opacity: introDone ? 1 : 0,
              y: introDone ? 0 : 60,
              filter: introDone ? 'blur(0px)' : 'blur(16px)',
            }}
            transition={{ delay: 2.6, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            className="font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.08]"
          >
            <span className="block">From trade-in to delivery,</span>
            <motion.span
              className="hero-gradient-text block mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: introDone ? 1 : 0 }}
              transition={{ delay: 2.9, duration: 1 }}
            >
              all in one place.
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: introDone ? 1 : 0, y: introDone ? 0 : 20 }}
            transition={{ delay: 3.0, duration: 0.6 }}
            className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto"
          >
            Trade-ins. CPO orders. COE workflows. AI pricing. Live tracking. One platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: introDone ? 1 : 0, y: introDone ? 0 : 20 }}
            transition={{ delay: 3.3, duration: 0.6 }}
            className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/login">
              <Button size="lg" className="min-w-[180px] h-12 text-base bg-gradient-to-r from-cyan-500 to-amber-500 hover:from-cyan-400 hover:to-amber-400 text-black font-semibold shadow-xl shadow-cyan-500/30">
                Sign In <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="min-w-[180px] h-12 text-base border-2 border-zinc-600 text-white hover:bg-white/5 hover:border-zinc-500">
                Request Access
              </Button>
            </Link>
          </motion.div>
          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: introDone ? 1 : 0 }}
            transition={{ delay: 3.8 }}
            className="mt-16 flex flex-col items-center gap-2"
          >
            <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-600">Scroll to explore</span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="h-8 w-5 rounded-full border-2 border-zinc-600/50 flex justify-center pt-2"
            >
              <motion.div className="h-1.5 w-1.5 rounded-full bg-cyan-500/70" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl">
          <FadeInUp>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold text-center text-white mb-4">
              All the tools. One place.
            </h2>
            <p className="text-center text-zinc-400 mb-14 max-w-2xl mx-auto">Smart pricing. Real-time visibility. Built to scale.</p>
          </FadeInUp>
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {features.map((item, i) => (
              <FadeInUp key={item.title} delay={i * 0.06}>
                <Link href="/login">
                  <motion.div
                    whileHover={{ y: -8, scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="group"
                  >
                    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${item.color} p-6 h-full transition-all duration-300 hover:border-white/20 hover:shadow-[0_0_50px_-12px_rgba(34,211,238,0.2)] group-hover:shadow-[0_0_60px_-15px_rgba(139,92,246,0.15)]`}>
                      <motion.div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 mb-4 ${item.iconColor}`}
                        whileHover={{ scale: 1.15, rotate: 5 }}
                        transition={{ type: 'spring', stiffness: 400 }}
                      >
                        <item.icon className="h-6 w-6" />
                      </motion.div>
                      <h3 className="font-heading font-semibold text-white mb-1 group-hover:text-cyan-300 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">{item.desc}</p>
                    </div>
                  </motion.div>
                </Link>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold text-center text-white mb-12">
              Four steps. Done.
            </h2>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {['Submit Order', 'AI Pricing', 'COE Process', 'Delivery'].map((step, i) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, type: 'spring', stiffness: 200 }}
                  whileHover={{ scale: 1.08, y: -4 }}
                  className="flex items-center gap-2"
                >
                  <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-5 py-3 text-sm font-medium text-white hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:shadow-[0_0_20px_-5px_rgba(34,211,238,0.2)] transition-all cursor-default">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-cyan-300 text-xs font-bold">
                      {i + 1}
                    </span>
                    {step}
                  </div>
                  {i < 3 && <div className="hidden sm:block w-6 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />}
                </motion.div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-8 lg:px-12 py-20 lg:py-28">
        <ScaleIn>
          <motion.div
            whileHover={{ scale: 1.02, y: -6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-cyan-500/15 via-violet-500/15 to-amber-500/15 border border-cyan-500/25 p-12 text-center relative overflow-hidden animate-glow-pulse"
          >
            <h2 className="font-heading text-2xl sm:text-4xl font-bold text-white mb-3">
              Ready?
            </h2>
            <p className="text-zinc-400 mb-8 text-lg">Sign in or request access. Go live in minutes.</p>
            <Link href="/login">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button size="lg" className="bg-gradient-to-r from-cyan-500 to-amber-500 hover:from-cyan-400 hover:to-amber-400 text-black font-semibold shadow-lg shadow-cyan-500/25 min-w-[200px]">
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
        transition={{ duration: 0.6 }}
        className="border-t border-white/5 py-10 px-6 sm:px-8 lg:px-12"
      >
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-400">DLM Engine</span>
          </div>
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} DLM Engine
          </p>
        </div>
      </motion.footer>
    </div>
  )
}
