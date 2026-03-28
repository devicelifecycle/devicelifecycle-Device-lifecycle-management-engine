'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Cpu, Package, Smartphone, Sparkles, TabletSmartphone, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'

type OrbitingDeviceFieldProps = {
  className?: string
  compact?: boolean
}

const stars = [
  { left: '8%', top: '12%', size: 2.2, delay: 0, duration: 3.2 },
  { left: '16%', top: '34%', size: 1.8, delay: 0.8, duration: 2.6 },
  { left: '28%', top: '18%', size: 2.4, delay: 1.1, duration: 3.6 },
  { left: '42%', top: '9%', size: 1.6, delay: 0.4, duration: 2.9 },
  { left: '58%', top: '22%', size: 2.5, delay: 1.7, duration: 3.4 },
  { left: '74%', top: '11%', size: 1.9, delay: 0.2, duration: 2.8 },
  { left: '86%', top: '28%', size: 2.8, delay: 1.3, duration: 3.8 },
  { left: '9%', top: '72%', size: 2.4, delay: 1.2, duration: 2.7 },
  { left: '24%', top: '84%', size: 1.7, delay: 0.7, duration: 3.1 },
  { left: '46%', top: '74%', size: 2.3, delay: 1.4, duration: 3.5 },
  { left: '67%', top: '83%', size: 1.8, delay: 0.5, duration: 2.9 },
  { left: '84%', top: '69%', size: 2.6, delay: 1.9, duration: 3.7 },
]

const orbits = [
  {
    icon: Smartphone,
    label: 'Trade-In',
    detail: 'Quotes live',
    radius: 182,
    angle: 16,
    duration: 28,
    accent: 'from-amber-200/25 to-primary/5 text-amber-100',
  },
  {
    icon: TabletSmartphone,
    label: 'CPO',
    detail: 'Vendor flow',
    radius: 234,
    angle: 128,
    duration: 34,
    accent: 'from-sky-200/20 to-cyan-300/5 text-sky-100',
  },
  {
    icon: Truck,
    label: 'Shipping',
    detail: 'Outbound lane',
    radius: 210,
    angle: 228,
    duration: 31,
    accent: 'from-teal-200/20 to-emerald-300/5 text-teal-100',
  },
  {
    icon: Cpu,
    label: 'Signals',
    detail: 'Pricing model',
    radius: 154,
    angle: 304,
    duration: 24,
    accent: 'from-violet-200/20 to-fuchsia-300/5 text-violet-100',
  },
]

const streaks = [
  { top: '18%', left: '12%', rotate: -18, delay: 0.8, duration: 7.5 },
  { top: '62%', left: '64%', rotate: -24, delay: 2.1, duration: 8.4 },
]

export function OrbitingDeviceField({ className, compact = false }: OrbitingDeviceFieldProps) {
  const shouldReduceMotion = useReducedMotion()
  const scale = compact ? 0.72 : 1

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <motion.div
        className="absolute left-1/2 top-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8"
        style={{ scale }}
        animate={shouldReduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-[16rem] w-[16rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/6"
        style={{ scale }}
        animate={shouldReduceMotion ? undefined : { rotate: -360 }}
        transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-3xl"
        style={{ scale }}
        animate={shouldReduceMotion ? undefined : { opacity: [0.18, 0.36, 0.18], scale: [1, 1.12, 1] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] border border-white/10 bg-black/25 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        style={{ scale }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-primary/20 text-primary">
          <Package className="h-6 w-6" />
        </div>
      </div>

      {stars.map((star) => (
        <motion.span
          key={`${star.left}-${star.top}`}
          className="absolute rounded-full bg-amber-50 shadow-[0_0_14px_rgba(255,247,209,0.55)]"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
          }}
          animate={shouldReduceMotion ? undefined : { opacity: [0.2, 1, 0.25], scale: [0.7, 1.2, 0.8] }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            delay: star.delay,
            ease: 'easeInOut',
          }}
        />
      ))}

      {streaks.map((streak, index) => (
        <motion.div
          key={`${streak.left}-${streak.top}`}
          className="absolute h-px w-28 bg-gradient-to-r from-transparent via-white/60 to-transparent"
          style={{ left: streak.left, top: streak.top, rotate: `${streak.rotate}deg`, scale }}
          animate={shouldReduceMotion ? undefined : { x: [0, 40, 82], opacity: [0, 0.7, 0] }}
          transition={{
            duration: streak.duration,
            repeat: Infinity,
            delay: streak.delay + index * 0.6,
            ease: 'easeInOut',
          }}
        />
      ))}

      {orbits.map((orbit, index) => (
        <motion.div
          key={orbit.label}
          className="absolute left-1/2 top-1/2 h-0 w-0"
          style={{ scale, rotate: `${orbit.angle}deg` }}
          animate={shouldReduceMotion ? undefined : { rotate: orbit.angle + 360 }}
          transition={{ duration: orbit.duration, repeat: Infinity, ease: 'linear' }}
        >
          <motion.div
            className={cn(
              'ml-2 flex w-36 items-center gap-3 rounded-[1.4rem] border border-white/10 bg-gradient-to-br px-4 py-3 shadow-[0_20px_45px_-26px_rgba(0,0,0,0.65)] backdrop-blur-xl',
              orbit.accent
            )}
            style={{ transform: `translateX(${orbit.radius}px)` }}
            animate={shouldReduceMotion ? undefined : { y: [0, -8, 0], scale: [1, 1.03, 1] }}
            transition={{ duration: 4.4 + index * 0.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
              <orbit.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/55">{orbit.label}</p>
              <p className="truncate text-sm font-medium text-white">{orbit.detail}</p>
            </div>
          </motion.div>
        </motion.div>
      ))}

      <motion.div
        className="absolute left-[18%] top-[24%] flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-amber-100 backdrop-blur-lg"
        animate={shouldReduceMotion ? undefined : { y: [0, -10, 0], x: [0, 8, 0], rotate: [0, 14, 0] }}
        transition={{ duration: 6.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ scale }}
      >
        <Sparkles className="h-4 w-4" />
      </motion.div>
      <motion.div
        className="absolute right-[14%] top-[42%] flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-cyan-100 backdrop-blur-lg"
        animate={shouldReduceMotion ? undefined : { y: [0, 12, 0], x: [0, -10, 0], rotate: [0, -16, 0] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
        style={{ scale }}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </motion.div>
    </div>
  )
}
