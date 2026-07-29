'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, Sparkles, HelpCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getFaqForRole } from '@/lib/onboarding/help-content'

function FaqAccordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-white">{question}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-3.5 text-[13px] leading-5 text-white/65">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const faqs = user ? getFaqForRole(user.role) : []

  const replayTour = () => {
    window.dispatchEvent(new CustomEvent('dlm:replay-tour'))
    onClose()
  }

  // Portal to document.body — this panel is triggered from inside <Header>,
  // and .topbar-surface has backdrop-filter applied (dark mode), which per
  // spec makes <header> the CSS containing block for fixed-position
  // descendants. That collapsed this panel's h-full to the header's own
  // ~58px height instead of the viewport. Same class of bug that fixed/
  // absolute overlays nested under a filtered/transformed ancestor always
  // hit — the portal sidesteps it entirely regardless of where it's triggered from.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed right-0 top-0 z-[96] flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-[#0a0a12] shadow-[0_0_64px_-16px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-[#3b82f6]" />
            <h2 className="text-sm font-semibold text-white">Help</h2>
          </div>
          <button onClick={onClose} title="Close" type="button" className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <button
            onClick={replayTour}
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1e40af] to-[#3b82f6] py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(209,120,67,0.5)] hover:shadow-lg transition-all"
          >
            <Sparkles className="h-4 w-4" />
            Replay Guided Tour
          </button>

          <div>
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Frequently Asked</p>
            <div className="space-y-2">
              {faqs.length === 0 ? (
                <p className="text-sm text-white/50">No FAQ content yet for your role.</p>
              ) : (
                faqs.map((faq) => <FaqAccordion key={faq.question} {...faq} />)
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>,
    document.body
  )
}
