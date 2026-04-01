'use client'

// ============================================================================
// PREMIUM CUSTOMER TRADE-IN WIZARD
// Apple / GoRecell / UniverCell-inspired multi-step flow
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Smartphone, Tablet, Laptop, Package,
  ChevronRight, ChevronLeft, Check, Loader2,
  Search, Sparkles, ShieldCheck, Banknote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CONDITION_CONFIG, STORAGE_OPTIONS, DEVICE_BRANDS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { DeviceCondition } from '@/types'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = 'smartphone' | 'tablet' | 'laptop' | 'other'

interface WizardDevice {
  id: string
  make: string
  model: string
  category: string
  storage_options?: string[]
}

interface QuoteResult {
  unit_price: number
  cpo_unit_price: number
  source: string
  competitor_count: number
}

interface WizardProps {
  customerId: string
  onSubmit: (payload: {
    customer_id: string
    type: 'trade_in'
    notes: string
    items: Array<{
      device_id: string
      quantity: number
      condition: DeviceCondition
      storage: string
      notes: string
    }>
  }) => Promise<void>
  isSubmitting: boolean
}

// ─── Step config ─────────────────────────────────────────────────────────────

const STEPS = ['Category', 'Brand', 'Model', 'Condition', 'Review']

// ─── Category definitions ────────────────────────────────────────────────────

const CATEGORIES: { id: Category; label: string; icon: React.ElementType; brands: string[] }[] = [
  {
    id: 'smartphone',
    label: 'Smartphone',
    icon: Smartphone,
    brands: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Motorola', 'Sony', 'LG', 'Xiaomi', 'Huawei'],
  },
  {
    id: 'tablet',
    label: 'Tablet',
    icon: Tablet,
    brands: ['Apple', 'Samsung', 'Microsoft', 'Lenovo', 'ASUS'],
  },
  {
    id: 'laptop',
    label: 'Laptop',
    icon: Laptop,
    brands: ['Apple', 'Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'Microsoft'],
  },
  {
    id: 'other',
    label: 'Other Device',
    icon: Package,
    brands: DEVICE_BRANDS,
  },
]

// ─── Condition card config ────────────────────────────────────────────────────

const CONDITION_CARDS: {
  id: DeviceCondition
  label: string
  headline: string
  bullets: string[]
  multiplier: number
}[] = [
  {
    id: 'excellent',
    label: 'Excellent',
    headline: 'Like new',
    bullets: ['No scratches or scuffs', 'Original battery health', 'All functions work perfectly'],
    multiplier: 0.95,
  },
  {
    id: 'good',
    label: 'Good',
    headline: 'Light use',
    bullets: ['Minor wear marks', 'Fully functional', 'Screen in great condition'],
    multiplier: 0.85,
  },
  {
    id: 'fair',
    label: 'Fair',
    headline: 'Visible wear',
    bullets: ['Noticeable scratches', 'May have minor dents', 'All features work'],
    multiplier: 0.70,
  },
  {
    id: 'poor',
    label: 'Poor',
    headline: 'Heavy wear',
    bullets: ['Cracked screen or body', 'Functional issues possible', 'Significant cosmetic damage'],
    multiplier: 0.50,
  },
]

// ─── Animation variants ───────────────────────────────────────────────────────

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-10">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300',
                i < current
                  ? 'bg-[var(--color-brand)] text-white'
                  : i === current
                  ? 'ring-2 ring-[var(--color-brand)] ring-offset-2 bg-[var(--color-brand)] text-white'
                  : 'bg-stone-100 text-stone-400'
              )}
            >
              {i < current ? <Check className="w-4 h-4" /> : <span>{i + 1}</span>}
            </div>
            <span
              className={cn(
                'text-[10px] font-medium tracking-wide hidden sm:block',
                i === current ? 'text-stone-800' : 'text-stone-400'
              )}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                'h-[2px] w-8 sm:w-14 mx-1 mb-4 rounded-full transition-all duration-500',
                i < current ? 'bg-[var(--color-brand)]' : 'bg-stone-200'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)] mb-2">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h2>
      {subtitle && <p className="mt-1.5 text-sm text-stone-500">{subtitle}</p>}
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function TradeInWizard({ customerId, onSubmit, isSubmitting }: WizardProps) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  // Selections
  const [category, setCategory] = useState<Category | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [device, setDevice] = useState<WizardDevice | null>(null)
  const [storage, setStorage] = useState<string>('')
  const [condition, setCondition] = useState<DeviceCondition | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  // Data
  const [allDevices, setAllDevices] = useState<WizardDevice[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteRevealed, setQuoteRevealed] = useState(false)

  // Load device catalog
  useEffect(() => {
    fetch('/api/pricing/catalog')
      .then(r => r.json())
      .then(data => {
        const list = (data.devices || data || []) as WizardDevice[]
        setAllDevices(list)
      })
      .catch(() => {})
  }, [])

  // Fetch quote when condition + device are set
  useEffect(() => {
    if (!device || !condition || !storage) { setQuote(null); return }
    setQuoteLoading(true)
    setQuoteRevealed(false)

    const mapped = condition === 'new' || condition === 'excellent'
      ? 'excellent' : condition === 'fair' ? 'fair'
      : condition === 'poor' ? 'broken' : 'good'

    fetch('/api/pricing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: device.id, condition: mapped, storage }),
    })
      .then(r => r.json())
      .then(data => {
        setQuote({
          unit_price: data.unit_price ?? 0,
          cpo_unit_price: data.cpo_unit_price ?? 0,
          source: data.source ?? 'estimate',
          competitor_count: data.competitor_count ?? 0,
        })
        // Small delay then reveal with animation
        setTimeout(() => setQuoteRevealed(true), 400)
      })
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false))
  }, [device, condition, storage])

  const go = useCallback((next: number) => {
    setDir(next > step ? 1 : -1)
    setStep(next)
  }, [step])

  const back = () => go(step - 1)
  const next = () => go(step + 1)

  const selectedCategory = CATEGORIES.find(c => c.id === category)
  const brandsForCategory = selectedCategory?.brands ?? DEVICE_BRANDS
  const filteredDevices = allDevices.filter(d => {
    const matchBrand = brand ? d.make?.toLowerCase() === brand.toLowerCase() : true
    const matchSearch = modelSearch
      ? d.model?.toLowerCase().includes(modelSearch.toLowerCase())
      : true
    return matchBrand && matchSearch
  })

  const storageOptions = device?.storage_options?.length
    ? device.storage_options
    : STORAGE_OPTIONS

  const totalValue = quote ? quote.unit_price * quantity : null

  async function handleSubmit() {
    if (!device || !condition || !storage || !customerId) return
    await onSubmit({
      customer_id: customerId,
      type: 'trade_in',
      notes,
      items: [{
        device_id: device.id,
        quantity,
        condition,
        storage,
        notes: '',
      }],
    })
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Header strip */}
      <div className="bg-white border-b border-stone-200 px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400 mb-0.5">
                Trade-In Request
              </p>
              <h1 className="text-lg font-bold text-stone-900">Get an instant quote</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              Secure &amp; free
            </div>
          </div>
          <StepIndicator current={step} />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <AnimatePresence mode="wait" custom={dir}>
            {/* ── Step 0: Category ─────────────────────────────── */}
            {step === 0 && (
              <motion.div key="step-0" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
                <SectionTitle
                  eyebrow="Step 1 of 5"
                  title="What type of device?"
                  subtitle="Select the category that best describes your device."
                />
                <div className="grid grid-cols-2 gap-4">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon
                    const active = category === cat.id
                    return (
                      <button
                        key={cat.id}
                        onClick={() => { setCategory(cat.id); setBrand(null); setDevice(null) }}
                        className={cn(
                          'group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-8 text-center transition-all duration-200',
                          active
                            ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5 shadow-sm'
                            : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
                        )}
                      >
                        <div className={cn(
                          'rounded-xl p-3 transition-colors',
                          active ? 'bg-[var(--color-brand)]/10' : 'bg-stone-100 group-hover:bg-stone-200'
                        )}>
                          <Icon className={cn('w-7 h-7', active ? 'text-[var(--color-brand)]' : 'text-stone-500')} />
                        </div>
                        <span className={cn('text-sm font-semibold', active ? 'text-stone-900' : 'text-stone-700')}>
                          {cat.label}
                        </span>
                        {active && (
                          <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--color-brand)] flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step 1: Brand ─────────────────────────────────── */}
            {step === 1 && (
              <motion.div key="step-1" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
                <SectionTitle
                  eyebrow="Step 2 of 5"
                  title="Select the brand"
                  subtitle="Choose the manufacturer of your device."
                />
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {brandsForCategory.map(b => {
                    const active = brand === b
                    return (
                      <button
                        key={b}
                        onClick={() => { setBrand(b); setDevice(null); setModelSearch('') }}
                        className={cn(
                          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-5 px-3 text-center transition-all duration-200',
                          active
                            ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5'
                            : 'border-stone-200 bg-white hover:border-stone-300'
                        )}
                      >
                        <div className={cn(
                          'text-3xl font-black tracking-tight leading-none',
                          active ? 'text-[var(--color-brand)]' : 'text-stone-300'
                        )}>
                          {b.slice(0, 1)}
                        </div>
                        <span className={cn('text-xs font-semibold leading-tight', active ? 'text-stone-900' : 'text-stone-600')}>
                          {b}
                        </span>
                        {active && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Model ──────────────────────────────────── */}
            {step === 2 && (
              <motion.div key="step-2" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
                <SectionTitle
                  eyebrow="Step 3 of 5"
                  title={`Which ${brand} model?`}
                  subtitle="Search or scroll to find your exact device."
                />
                <div className="relative mb-4">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <Input
                    placeholder={`Search ${brand} models…`}
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                    className="pl-10 h-11 bg-white border-stone-200 rounded-xl"
                    autoFocus
                  />
                </div>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredDevices.length === 0 && (
                    <div className="text-center py-12 text-stone-400 text-sm">
                      No models found — try a different search.
                    </div>
                  )}
                  {filteredDevices.map(d => {
                    const active = device?.id === d.id
                    return (
                      <button
                        key={d.id}
                        onClick={() => { setDevice(d); setStorage('') }}
                        className={cn(
                          'w-full flex items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-150',
                          active
                            ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5'
                            : 'border-stone-200 bg-white hover:border-stone-300'
                        )}
                      >
                        <div>
                          <p className={cn('text-sm font-semibold', active ? 'text-stone-900' : 'text-stone-700')}>
                            {d.model}
                          </p>
                          <p className="text-xs text-stone-400 mt-0.5">{d.make}</p>
                        </div>
                        {active && <Check className="w-4 h-4 text-[var(--color-brand)] shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Condition & Storage ────────────────────── */}
            {step === 3 && (
              <motion.div key="step-3" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
                <SectionTitle
                  eyebrow="Step 4 of 5"
                  title="What's the condition?"
                  subtitle="Be honest — accurate grading means faster processing and payment."
                />

                {/* Storage selector */}
                <div className="mb-6">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Storage</p>
                  <div className="flex flex-wrap gap-2">
                    {storageOptions.map(s => (
                      <button
                        key={s}
                        onClick={() => setStorage(s)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg border text-sm font-medium transition-all duration-150',
                          storage === s
                            ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/8 text-stone-900'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Condition cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CONDITION_CARDS.map(card => {
                    const active = condition === card.id
                    const baseEstimate = quote?.unit_price && condition === card.id
                      ? null
                      : null
                    return (
                      <button
                        key={card.id}
                        onClick={() => setCondition(card.id)}
                        className={cn(
                          'group relative flex flex-col rounded-2xl border-2 p-5 text-left transition-all duration-200',
                          active
                            ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5 shadow-sm'
                            : 'border-stone-200 bg-white hover:border-stone-300'
                        )}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className={cn('text-sm font-bold', active ? 'text-stone-900' : 'text-stone-700')}>
                              {card.label}
                            </p>
                            <p className="text-xs text-stone-400">{card.headline}</p>
                          </div>
                          {active && (
                            <div className="w-5 h-5 rounded-full bg-[var(--color-brand)] flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {card.bullets.map(b => (
                            <li key={b} className="flex items-center gap-1.5 text-xs text-stone-500">
                              <div className={cn('w-1 h-1 rounded-full shrink-0', active ? 'bg-[var(--color-brand)]' : 'bg-stone-300')} />
                              {b}
                            </li>
                          ))}
                        </ul>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step 4: Review & Quote ─────────────────────────── */}
            {step === 4 && (
              <motion.div key="step-4" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
                <SectionTitle
                  eyebrow="Step 5 of 5"
                  title="Your instant quote"
                  subtitle="Review the details below and submit your trade-in request."
                />

                {/* Quote card */}
                <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden mb-6 shadow-sm">
                  {/* Device summary */}
                  <div className="px-6 py-5 border-b border-stone-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-stone-400 uppercase tracking-wider font-semibold mb-0.5">Device</p>
                        <p className="text-base font-bold text-stone-900">{device?.model}</p>
                        <p className="text-sm text-stone-500">{brand} · {storage} · {CONDITION_CARDS.find(c => c.id === condition)?.label}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-stone-400 uppercase tracking-wider font-semibold mb-0.5">Qty</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setQuantity(q => Math.max(1, q - 1))}
                            className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-50 transition-colors font-bold text-lg leading-none"
                          >−</button>
                          <span className="w-6 text-center font-semibold text-stone-900">{quantity}</span>
                          <button
                            onClick={() => setQuantity(q => q + 1)}
                            className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-50 transition-colors font-bold text-lg leading-none"
                          >+</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quote reveal */}
                  <div className="px-6 py-6">
                    {quoteLoading ? (
                      <div className="flex items-center gap-3 text-stone-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Calculating your quote…</span>
                      </div>
                    ) : quote ? (
                      <AnimatePresence>
                        {quoteRevealed && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <div className="flex items-end justify-between">
                              <div>
                                <p className="text-xs text-stone-400 uppercase tracking-wider font-semibold mb-1">
                                  Estimated Trade-In Value
                                </p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-4xl font-black text-stone-900 tracking-tight">
                                    {formatCurrency(quote.unit_price * quantity)}
                                  </span>
                                  {quantity > 1 && (
                                    <span className="text-sm text-stone-400">
                                      ({formatCurrency(quote.unit_price)} each)
                                    </span>
                                  )}
                                </div>
                                {quote.competitor_count > 0 && (
                                  <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    Based on {quote.competitor_count} competitor prices
                                  </p>
                                )}
                              </div>
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}
                                className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center"
                              >
                                <Check className="w-6 h-6 text-green-600" />
                              </motion.div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    ) : (
                      <p className="text-sm text-stone-400">Quote unavailable — our team will follow up with pricing.</p>
                    )}
                  </div>
                </div>

                {/* Trust signals */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { icon: ShieldCheck, label: 'Data wiped before resale' },
                    { icon: Banknote, label: 'Payment within 5 business days' },
                    { icon: Package, label: 'Free prepaid shipping label' },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl bg-white border border-stone-200 p-4 text-center">
                      <Icon className="w-5 h-5 text-[var(--color-brand)]" />
                      <span className="text-[11px] text-stone-500 font-medium leading-tight">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <div className="mb-2">
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                    Additional notes (optional)
                  </label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any details about the device condition, accessories included, etc."
                    className="resize-none bg-white border-stone-200 rounded-xl text-sm"
                    rows={3}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-stone-200">
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 0}
              className="gap-1.5 text-stone-600"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                onClick={next}
                disabled={
                  (step === 0 && !category) ||
                  (step === 1 && !brand) ||
                  (step === 2 && !device) ||
                  (step === 3 && (!condition || !storage))
                }
                className="gap-1.5 bg-[var(--color-brand)] hover:bg-[var(--color-brand)]/90 text-white rounded-xl px-6"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !customerId}
                className="gap-1.5 bg-[var(--color-brand)] hover:bg-[var(--color-brand)]/90 text-white rounded-xl px-8"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                ) : (
                  <>Submit Trade-In <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
