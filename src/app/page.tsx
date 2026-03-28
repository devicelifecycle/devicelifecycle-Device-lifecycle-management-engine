'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Package,
  Radar,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OrbitingDeviceField } from '@/components/landing/OrbitingDeviceField'
import { useAuth } from '@/hooks/useAuth'

const features = [
  {
    icon: ShoppingCart,
    title: 'Order choreography',
    description: 'Trade-in and CPO workflows stitched together without bouncing across disconnected tools.',
  },
  {
    icon: BarChart3,
    title: 'Pricing intelligence',
    description: 'Market-aware quoting, competitor signals, and operational visibility in one system.',
  },
  {
    icon: ClipboardCheck,
    title: 'COE execution',
    description: 'Receiving, triage, exceptions, and outbound shipping live in the same operational thread.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-built access',
    description: 'Admins, sales, COE teams, customers, and vendors each see the right control surface.',
  },
]

const heroSignals = [
  { label: 'Pricing live', value: '15.6k competitor rows', accent: 'text-amber-200' },
  { label: 'COE visibility', value: 'Receiving to shipping', accent: 'text-teal-200' },
  { label: 'Role routing', value: 'Admin to vendor lanes', accent: 'text-sky-200' },
]

const operationsRail = [
  {
    icon: Workflow,
    label: 'Unified flow',
    detail: 'Orders move through intake, quote, exceptions, and dispatch without losing context.',
  },
  {
    icon: Radar,
    label: 'Signal-fed pricing',
    detail: 'Competitor pulls, baselines, and control rules shape every quote window.',
  },
  {
    icon: Truck,
    label: 'Outbound ready',
    detail: 'Receiving, triage, and fulfillment stay visible as one operational thread.',
  },
]

export default function LandingPage() {
  const router = useRouter()
  const { isAuthenticated, isInitializing } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, isInitializing, router])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#130f0d] text-stone-100">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(209,124,67,0.22),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(234,192,130,0.14),transparent_18%),linear-gradient(180deg,#130f0d_0%,#090706_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:56px_56px] opacity-35" />
        <OrbitingDeviceField className="opacity-60 sm:opacity-75" compact />
        <motion.div
          className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
          animate={shouldReduceMotion ? undefined : { x: [0, 70, -20, 0], y: [0, 40, 20, 0], scale: [1, 1.1, 0.95, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-0 top-24 h-80 w-80 rounded-full bg-amber-100/10 blur-3xl"
          animate={shouldReduceMotion ? undefined : { x: [0, -60, 20, 0], y: [0, -30, 24, 0], scale: [1, 0.92, 1.08, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl"
          animate={shouldReduceMotion ? undefined : { x: [0, 24, -30, 0], y: [0, -35, 10, 0], opacity: [0.35, 0.55, 0.28, 0.35] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col px-5 pb-10 pt-6 sm:px-8 lg:px-10">
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-primary text-primary-foreground shadow-[0_20px_45px_-24px_rgba(182,93,47,0.9)]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="editorial-title text-3xl leading-none brand-gradient">DLM Engine</p>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Device Lifecycle Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="outline" className="transition-transform duration-300 hover:-translate-y-0.5">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button className="animate-shine">Request Access</Button>
            </Link>
          </div>
        </motion.header>

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-14">
          <section className="relative space-y-8">
            <div className="pointer-events-none absolute -left-4 top-24 hidden h-40 w-40 rounded-full border border-white/6 lg:block" />
            <div className="pointer-events-none absolute left-20 top-56 hidden h-3 w-3 rounded-full bg-primary/60 shadow-[0_0_24px_rgba(182,93,47,0.75)] lg:block" />
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="eyebrow-label"
            >
              Enterprise Device Operations
            </motion.span>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="space-y-6"
            >
              <h1 className="editorial-title max-w-5xl text-5xl text-stone-100 sm:text-6xl lg:text-7xl">
                The device lifecycle system that feels built for the floor, not for a pitch deck.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-stone-400">
                From intake to quote, from triage to shipping, DLM Engine gives teams one operating environment with
                real pricing context and role-aware workflows.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="flex flex-wrap gap-3"
            >
              <Link href="/login">
                <Button size="lg">
                  Enter the platform
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline">
                  View dashboard
                </Button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="grid gap-3 sm:grid-cols-3"
            >
              {heroSignals.map((signal, index) => (
                <motion.div
                  key={signal.label}
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.28 + index * 0.08, duration: 0.65 }}
                  whileHover={shouldReduceMotion ? undefined : { y: -4, scale: 1.015 }}
                  className="rounded-[1.45rem] border border-white/8 bg-white/[0.035] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">{signal.label}</p>
                  <p className={`mt-2 text-sm font-medium ${signal.accent}`}>{signal.value}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34 }}
              className="grid gap-4 sm:grid-cols-2"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 22, rotateX: -5 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: 0.42 + index * 0.08, duration: 0.7 }}
                  whileHover={shouldReduceMotion ? undefined : { y: -8, rotateX: 3, rotateY: index % 2 === 0 ? -2 : 2 }}
                  className="surface-panel rounded-[1.6rem] p-5"
                  style={{ transformPerspective: 1200 }}
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <p className="mb-2 text-lg font-semibold text-stone-100">{feature.title}</p>
                  <p className="text-sm leading-6 text-stone-400">{feature.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          <section className="relative">
            <OrbitingDeviceField className="opacity-75" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              whileHover={shouldReduceMotion ? undefined : { rotateY: -3, rotateX: 2, y: -6 }}
              className="surface-panel relative overflow-hidden rounded-[2.2rem] p-6 sm:p-8"
              style={{ transformPerspective: 1400 }}
            >
              <div className="absolute inset-x-0 top-0 h-px copper-line opacity-75" />
              <motion.div
                className="pointer-events-none absolute inset-x-8 h-24 rounded-full bg-primary/10 blur-3xl"
                animate={shouldReduceMotion ? undefined : { top: ['6%', '72%', '28%', '6%'], opacity: [0.18, 0.32, 0.16, 0.18] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-primary/55 to-transparent"
                animate={shouldReduceMotion ? undefined : { x: ['12%', '88%', '12%'], opacity: [0, 0.9, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Live Canvas</p>
                  <p className="mt-2 text-2xl font-semibold text-stone-100">One view across the operation</p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-stone-300">
                  Always-on
                </div>
              </div>

              <div className="grid gap-4">
                <div className="metric-tile p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Order throughput</p>
                    <Truck className="h-5 w-5 text-amber-200" />
                  </div>
                  <p className="text-4xl font-semibold text-stone-100">Fast, visible, traceable.</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-stone-400">
                    Intake, logistics, receiving, triage, and shipping remain connected, so context doesn’t fall apart
                    between teams.
                  </p>
                </div>

                <div className="grid gap-3">
                  {operationsRail.map((item, index) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.32 + index * 0.12, duration: 0.65 }}
                      className="flex items-start gap-4 rounded-[1.5rem] border border-white/8 bg-black/15 px-4 py-4"
                    >
                      <motion.div
                        className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05] text-primary"
                        animate={shouldReduceMotion ? undefined : { scale: [1, 1.06, 1], opacity: [0.88, 1, 0.88] }}
                        transition={{ duration: 2.8, repeat: Infinity, delay: index * 0.35 }}
                      >
                        <item.icon className="h-4 w-4" />
                      </motion.div>
                      <div>
                        <p className="text-sm font-semibold text-stone-100">{item.label}</p>
                        <p className="mt-1 text-sm leading-6 text-stone-400">{item.detail}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <motion.div
                    className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5"
                    animate={shouldReduceMotion ? undefined : { y: [0, -5, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <p className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">Pricing</p>
                    <p className="text-xl font-semibold text-stone-100">Competitor-aware</p>
                    <p className="mt-2 text-sm leading-6 text-stone-400">Scraped trade-in signals and internal baselines drive quoting with less guesswork.</p>
                  </motion.div>
                  <motion.div
                    className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5"
                    animate={shouldReduceMotion ? undefined : { y: [0, -5, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
                  >
                    <p className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">Controls</p>
                    <p className="text-xl font-semibold text-stone-100">Role-specific</p>
                    <p className="mt-2 text-sm leading-6 text-stone-400">Different users get tailored paths without losing the sense of a shared system.</p>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </section>
        </main>
      </div>
    </div>
  )
}
