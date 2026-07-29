'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { TourStep } from '@/lib/onboarding/tours'

const CARD_WIDTH = 320
const GAP = 16
const MARGIN = 16

function computePosition(targetSelector: string, placement: TourStep['placement']) {
  const el = document.querySelector(`[data-tour="${targetSelector}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Try the preferred placement; fall back to whichever side actually fits.
  const fits = {
    right: r.right + GAP + CARD_WIDTH < vw,
    left: r.left - GAP - CARD_WIDTH > 0,
    bottom: r.bottom + GAP + 160 < vh,
    top: r.top - GAP - 160 > 0,
  }
  const order: NonNullable<TourStep['placement']>[] = [placement || 'right', 'right', 'bottom', 'left', 'top']
  const side = order.find((s) => fits[s]) || 'bottom'

  switch (side) {
    case 'right':
      return { top: clamp(r.top, MARGIN, vh - 200), left: r.right + GAP, side }
    case 'left':
      return { top: clamp(r.top, MARGIN, vh - 200), left: r.left - GAP - CARD_WIDTH, side }
    case 'top':
      return { top: r.top - GAP - 160, left: clamp(r.left, MARGIN, vw - CARD_WIDTH - MARGIN), side }
    default:
      return { top: r.bottom + GAP, left: clamp(r.left, MARGIN, vw - CARD_WIDTH - MARGIN), side }
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max))
}

export function TourCallout({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep
  stepIndex: number
  totalSteps: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const [pos, setPos] = useState<{ top: number; left: number; side: string } | null>(null)

  useEffect(() => {
    const update = () => setPos(computePosition(step.target, step.placement))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const interval = setInterval(update, 200) // catches spotlight's spring-animated movement
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      clearInterval(interval)
    }
  }, [step.target, step.placement])

  if (!pos) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.target}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="fixed z-[80] rounded-2xl border border-white/[0.08] bg-[#0a0a12]/97 backdrop-blur-2xl p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]"
        style={{ top: pos.top, left: pos.left, width: CARD_WIDTH }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">{step.title}</h3>
          <button onClick={onSkip} title="Skip tour" type="button" className="shrink-0 rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-white/65">{step.description}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === stepIndex ? 'w-4 bg-[#3b82f6]' : 'w-1.5 bg-white/15'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <button
                onClick={onBack}
                title="Back"
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onNext}
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#1e40af] to-[#3b82f6] px-3 py-1.5 text-xs font-semibold text-white hover:shadow-md transition-all"
            >
              {stepIndex === totalSteps - 1 ? 'Done' : 'Next'}
              {stepIndex < totalSteps - 1 && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
