'use client'

import { motion } from 'framer-motion'
import { Package, Sparkles } from 'lucide-react'
import { WELCOME_COPY } from '@/lib/onboarding/tours'
import type { UserRole } from '@/types'

export function WelcomeScreen({
  role,
  fullName,
  onStart,
  onSkip,
}: {
  role: UserRole
  fullName?: string
  onStart: () => void
  onSkip: () => void
}) {
  const copy = WELCOME_COPY[role]
  const firstName = fullName?.split(' ')[0]

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#06050a]/85 backdrop-blur-md px-6">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#0a0a12] p-8 text-center shadow-[0_32px_80px_-20px_rgba(0,0,0,0.8)]"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d17843]/70 to-transparent" />

        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9a4a1f] to-[#d17843] shadow-[0_8px_28px_-6px_rgba(209,120,67,0.55)]">
          <Package className="h-6 w-6 text-white" />
        </div>

        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d17843]">
          {firstName ? `Welcome, ${firstName}` : 'Welcome'}
        </p>
        <h1 className="mb-3 font-heading italic text-2xl text-white">{copy.headline}</h1>
        <p className="mb-7 text-sm leading-6 text-white/65">{copy.body}</p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={onStart}
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#9a4a1f] to-[#d17843] py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(209,120,67,0.5)] hover:shadow-lg transition-all"
          >
            <Sparkles className="h-4 w-4" />
            Start Guided Tour
          </button>
          <button
            onClick={onSkip}
            type="button"
            className="rounded-xl py-2.5 text-sm font-medium text-white/50 hover:text-white/80 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </motion.div>
    </div>
  )
}
