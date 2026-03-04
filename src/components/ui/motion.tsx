'use client'

import React from 'react'
import { motion, useInView, type Variants } from 'framer-motion'

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
}

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
}

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

const defaultTransition = { type: 'spring' as const, stiffness: 300, damping: 24 }

interface MotionDivProps {
  children: React.ReactNode
  className?: string
  delay?: number
  once?: boolean
  amount?: number
  as?: 'div' | 'span' | 'section'
}

export function FadeInUp({ children, className, delay = 0, once = true, amount = 0.2 }: MotionDivProps) {
  const ref = React.useRef(null)
  const isInView = useInView(ref, { once, amount })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={fadeInUp}
      transition={{ ...defaultTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function FadeIn({ children, className, delay = 0, once = true, amount = 0.2 }: MotionDivProps) {
  const ref = React.useRef(null)
  const isInView = useInView(ref, { once, amount })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={fadeIn}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function ScaleIn({ children, className, delay = 0, once = true, amount = 0.2 }: MotionDivProps) {
  const ref = React.useRef(null)
  const isInView = useInView(ref, { once, amount })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={scaleIn}
      transition={{ ...defaultTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerChildren({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function MotionCard({
  children,
  className,
  delay = 0,
  hover = true,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  hover?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...defaultTransition, delay }}
      whileHover={hover ? { y: -4, scale: 1.01, transition: { duration: 0.2 } } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedList({ children, className, staggerDelay = 0.06 }: { children: React.ReactNode; className?: string; staggerDelay?: number }) {
  const container: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: staggerDelay, delayChildren: 0.1 },
    },
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={container}
      className={className}
    >
      {React.Children.map(children, (child, i) => (
        <motion.div key={i} variants={fadeInUp} transition={defaultTransition}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

export function PulsingDot({ className, color }: { className?: string; color?: string }) {
  return (
    <motion.div
      className={className}
      style={{ backgroundColor: color }}
      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

export function AnimatedCounter({ value, duration = 1 }: { value: number; duration?: number }) {
  const [count, setCount] = React.useState(0)
  const ref = React.useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  React.useEffect(() => {
    if (!isInView) return
    let start = 0
    const end = value
    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / (duration * 1000), 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [isInView, value, duration])

  return <span ref={ref}>{count}</span>
}
