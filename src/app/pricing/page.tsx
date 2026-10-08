// ============================================================================
// PUBLIC PRICING PAGE — built from the plan-tiers source of truth
// ============================================================================
// One source of truth: PLAN_TIERS defines what each tier contains, and the
// subscription_plans table holds the prices. Changing a plan in admin changes
// what this page shows. When prices are null (pending approval), the page
// says "Contact us" instead of showing $0.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { ByteBackMark } from '@/components/brand/ByteBackMark'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

interface PricingPlan {
  slug: string
  name: string
  tagline: string
  bestFor: string
  monthlyPrice: number | null
  currency: string
  highlights: string[]
  inheritsFrom: string | null
  contactSales: boolean
  roadmap: string[]
}

export default function PricingPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [interval, setInterval] = useState<'month' | 'year'>('month')

  useEffect(() => {
    fetch('/api/pricing/plans')
      .then(r => r.json())
      .then(j => setPlans(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const annualDiscount = 0.8 // 20% discount for annual

  return (
    <div className="relative min-h-screen bg-white text-slate-700 antialiased">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,30,61,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,30,61,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(60%_60%_at_50%_28%,black,transparent)]" />
        <div className="absolute -top-44 left-1/2 h-[26rem] w-[46rem] max-w-[92vw] -translate-x-1/2 rounded-full bg-blue-500/[0.08] blur-[90px]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        {/* Header */}
        <header className="flex items-center justify-between py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#12224a] to-[#1e3a8a] text-white shadow-sm">
              <ByteBackMark className="h-4 w-4" />
            </div>
            <div className="leading-none">
              <p className="text-lg font-extrabold tracking-tight text-[#0f1e3d]">Byte-Back</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm" className="h-9">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="h-9">Start Free Trial</Button>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="pb-8 pt-12 text-center lg:pt-20">
          <Badge variant="outline" className="mx-auto mb-6 text-blue-600 border-blue-200 bg-blue-50">
            <Sparkles className="mr-1.5 h-3 w-3" />
            14-day free trial · No credit card required
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-[#0f1e3d] sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Choose the plan that fits your device lifecycle program. Start with a free trial, upgrade when you&apos;re ready.
          </p>

          {/* Interval toggle */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setInterval('month')}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                interval === 'month'
                  ? 'bg-white text-[#0f1e3d] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('year')}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                interval === 'year'
                  ? 'bg-white text-[#0f1e3d] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs text-emerald-600 font-semibold">Save 20%</span>
            </button>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="grid gap-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-3 py-20 text-center text-sm text-muted-foreground">
              Loading plans...
            </div>
          ) : plans.map((plan, i) => {
            const isPopular = i === 1
            const price = plan.monthlyPrice
            const displayPrice = price !== null
              ? interval === 'year'
                ? Math.round(price * annualDiscount * 100) / 100
                : price
              : null

            return (
              <div
                key={plan.slug}
                className={`relative flex flex-col rounded-2xl border p-7 transition-all duration-300 ${
                  isPopular
                    ? 'border-blue-200 bg-white shadow-xl shadow-blue-600/10 ring-1 ring-blue-100'
                    : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-lg'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600">Most popular</Badge>
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-xl font-bold text-[#0f1e3d]">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
                </div>

                <div className="mb-6">
                  {displayPrice !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight text-[#0f1e3d]">
                        {formatCurrency(displayPrice, plan.currency)}
                      </span>
                      <span className="text-sm text-slate-500">
                        /{interval === 'year' ? 'mo, billed annually' : 'mo'}
                      </span>
                    </div>
                  ) : plan.contactSales ? (
                    <div>
                      <span className="text-3xl font-bold tracking-tight text-[#0f1e3d]">Custom</span>
                      <p className="mt-1 text-sm text-slate-500">Tailored to your scale</p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-2xl font-semibold text-amber-600">Coming soon</span>
                      <p className="mt-1 text-sm text-slate-500">Pricing to be announced</p>
                    </div>
                  )}
                </div>

                <div className="mb-6 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  <span className="font-medium">Best for:</span> {plan.bestFor}
                </div>

                {plan.contactSales ? (
                  <Link href="/register" className="mb-6">
                    <Button variant="outline" className="w-full h-11 border-slate-300">
                      Contact sales
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/signup?plan=${plan.slug}`} className="mb-6">
                    <Button
                      className={`w-full h-11 ${
                        isPopular
                          ? 'bg-blue-600 shadow-lg shadow-blue-600/25 hover:bg-blue-700'
                          : ''
                      }`}
                    >
                      Start free trial
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                )}

                {plan.inheritsFrom && (
                  <p className="mb-3 text-xs font-medium text-blue-600">
                    Everything in {plans.find(p => p.slug === plan.inheritsFrom)?.name ?? plan.inheritsFrom}, plus:
                  </p>
                )}

                <ul className="flex-1 space-y-2.5">
                  {plan.highlights.map(h => (
                    <li key={h} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                      {h}
                    </li>
                  ))}
                </ul>

                {plan.roadmap.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Coming soon</p>
                    {plan.roadmap.map(r => (
                      <p key={r} className="text-xs text-slate-400">{r}</p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* FAQ-style section */}
        <section className="border-t border-slate-100 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-[#0f1e3d]">Questions?</h2>
            <p className="mt-4 text-slate-600">
              Every plan includes a 14-day free trial with full access. No credit card required to start.
              Upgrade, downgrade, or cancel at any time.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/signup">
                <Button size="lg">Start your free trial</Button>
              </Link>
              <Link href="/">
                <Button size="lg" variant="outline">Learn more</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 py-10 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#12224a] to-[#1e3a8a] text-white">
              <ByteBackMark className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-[#0f1e3d]">Byte-Back</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-[#0f1e3d]">Sign in</Link>
            <Link href="/signup" className="hover:text-[#0f1e3d]">Sign up</Link>
            <Link href="/privacy-policy" className="hover:text-[#0f1e3d]">Privacy</Link>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
