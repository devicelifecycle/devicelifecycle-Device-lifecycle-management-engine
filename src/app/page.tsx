// ============================================================================
// LANDING PAGE — Enterprise banking client presentation
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, ShoppingCart, Brain, Truck, BarChart3, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

const DEVICE_IMAGES = {
  iphoneWhite: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=320&q=90',
  macbook: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=480&q=90',
}

const features = [
  { icon: ShoppingCart, title: 'Orders', desc: 'Trade-in & CPO, end-to-end.' },
  { icon: Brain, title: 'AI Pricing', desc: 'Self-learning, market-trained.' },
  { icon: Truck, title: 'COE', desc: 'Receive, triage, ship.' },
]

const steps = [
  { num: '1', title: 'Submit' },
  { num: '2', title: 'Quote' },
  { num: '3', title: 'Process' },
  { num: '4', title: 'Ship' },
]

export default function LandingPage() {
  const router = useRouter()
  const { isAuthenticated, isInitializing } = useAuth()
  const [introDone, setIntroDone] = useState(false)

  useEffect(() => {
    if (!isInitializing && isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, isInitializing, router])

  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), 1200)
    return () => clearTimeout(t)
  }, [])

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 rounded-full border-2 border-slate-600 border-t-blue-500 animate-spin" />
      </div>
    )
  }

  if (isAuthenticated) return null

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Intro */}
      <AnimatePresence>
        {!introDone && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="h-12 w-12 rounded-lg bg-blue-600 flex items-center justify-center mx-auto mb-4">
                <Package className="h-6 w-6 text-white" />
              </div>
              <p className="font-semibold text-lg text-white tracking-tight">DLM Engine</p>
              <p className="text-slate-500 text-xs mt-1 tracking-widest uppercase">Device Lifecycle Management</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.06)_0%,transparent_50%)]" />
      </div>

      {/* Nav */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: introDone ? 1 : 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="flex h-14 items-center justify-between px-6 lg:px-12 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-50"
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Package className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">DLM Engine</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800/50">
              Sign In
            </Button>
          </Link>
          <Link href="/login">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              Get Started <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </motion.nav>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: introDone ? 1 : 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="relative px-6 lg:px-12 pt-20 pb-24 lg:pt-28 lg:pb-32 min-h-[85vh] flex flex-col items-center justify-center"
      >
        {/* Static devices — subtle, professional */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="relative w-full max-w-5xl h-[500px] mx-auto opacity-20">
            <div className="absolute top-[12%] left-[10%] w-[100px] h-[200px]">
              <div className="rounded-[1.4rem] overflow-hidden shadow-xl">
                <Image src={DEVICE_IMAGES.iphoneWhite} alt="" width={100} height={200} className="object-cover w-full h-full" />
              </div>
            </div>
            <div className="absolute top-[18%] right-[8%] w-[180px] h-[115px]">
              <div className="rounded-lg overflow-hidden shadow-xl">
                <Image src={DEVICE_IMAGES.macbook} alt="" width={180} height={115} className="object-cover w-full h-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <h1 className="font-semibold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-white leading-tight">
            Device lifecycle management
            <br />
            <span className="text-blue-400">for enterprise.</span>
          </h1>
          <p className="mt-5 text-slate-400 text-base max-w-lg mx-auto">
            Trade-in to delivery. AI-powered pricing. Built for financial institutions.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link href="/login">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                Get Started <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg" className="border-slate-600 text-slate-300 hover:bg-slate-800/50 hover:text-white">
                Request Access
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Features */}
      <section className="px-6 lg:px-12 py-16 lg:py-24 border-t border-slate-800/60">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-semibold text-xl text-slate-300 text-center mb-12">
            Core capabilities
          </h2>
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-3">
            {features.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-6"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800">
                  <item.icon className="h-4 w-4 text-blue-400" />
                </div>
                <h3 className="font-medium text-white text-base mt-4 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="px-6 lg:px-12 py-16 lg:py-20 border-t border-slate-800/60">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2">
            {steps.map((step, i) => (
              <span key={step.num} className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-400">
                  {step.num}. {step.title}
                </span>
                {i < steps.length - 1 && <span className="text-slate-600 text-xs">→</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* AI */}
      <section className="px-6 lg:px-12 py-16 lg:py-20 border-t border-slate-800/60">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800">
              <Brain className="h-4 w-4 text-blue-400" />
            </div>
            <p className="text-slate-500 text-sm">
              Self-learning pricing. Trained from your data.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 lg:px-12 py-16 lg:py-20 border-t border-slate-800/60">
        <div className="text-center">
          <Link href="/login">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
              Get Started <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 px-6 lg:px-12">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <span className="text-xs text-slate-600">DLM Engine</span>
          <span className="text-xs text-slate-700">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
