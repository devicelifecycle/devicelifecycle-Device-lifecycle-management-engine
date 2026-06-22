'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 8

/**
 * Dims the whole viewport except a rounded cutout around the target element,
 * using a box-shadow spread (no SVG mask needed) — a positioned transparent
 * box with `box-shadow: 0 0 0 9999px rgba(...)` dims everything outside it.
 * Tracks the target across scroll/resize so the cutout stays glued to it.
 */
export function Spotlight({ targetSelector, onTargetMissing }: { targetSelector: string; onTargetMissing: () => void }) {
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    let raf = 0
    let missingTimer: ReturnType<typeof setTimeout> | null = null
    let firedMissing = false
    let scrolledIntoView = false

    const measure = () => {
      if (firedMissing) return
      const el = document.querySelector(`[data-tour="${targetSelector}"]`)
      if (!el) {
        // Element not mounted yet (slow render) or not on this layout at all
        // (e.g. a nav item collapsed on mobile) — give it a moment, then
        // skip the step entirely rather than leaving the tour stuck.
        if (!missingTimer) {
          missingTimer = setTimeout(() => { firedMissing = true; onTargetMissing() }, 1200)
        }
        raf = requestAnimationFrame(measure)
        return
      }
      if (missingTimer) {
        clearTimeout(missingTimer)
        missingTimer = null
      }
      const r = el.getBoundingClientRect()
      // Nav items can be scrolled out of view inside the sidebar's own
      // overflow-y-auto (e.g. "Users" under Control, below the fold) — pull
      // it into view once per step. scrollIntoView already walks every
      // scrollable ancestor (the nav's internal scroll, the window, etc.),
      // so this works regardless of which container actually needs to move.
      if (!scrolledIntoView) {
        scrolledIntoView = true
        const fullyVisible = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth
        if (!fullyVisible) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }
      setRect({
        top: r.top - PADDING,
        left: r.left - PADDING,
        width: r.width + PADDING * 2,
        height: r.height + PADDING * 2,
      })
      raf = requestAnimationFrame(measure)
    }

    raf = requestAnimationFrame(measure)
    return () => {
      cancelAnimationFrame(raf)
      if (missingTimer) clearTimeout(missingTimer)
    }
  }, [targetSelector, onTargetMissing])

  if (!rect) return null

  return (
    <>
      {/* Blocks interaction with the rest of the page while the tour is
          active — the cutout ring below is purely visual (box-shadow
          doesn't get its own hit-testing), so this needs its own layer. */}
      <div className="fixed inset-0 z-[69]" />
      <motion.div
        className="fixed z-[70] rounded-2xl pointer-events-none ring-2 ring-[#d17843]"
        initial={false}
        animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ boxShadow: '0 0 0 9999px rgba(8, 6, 4, 0.72)' }}
      />
    </>
  )
}
