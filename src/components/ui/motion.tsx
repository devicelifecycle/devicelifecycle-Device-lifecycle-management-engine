'use client'

import React from 'react'
import { motion, useInView, type Variants } from 'framer-motion'

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 24 },
  },
}

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 22 },
  },
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
      initial={{ opacity: 0, y: 20, rotateX: -5 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ ...defaultTransition, delay }}
      whileHover={hover ? { y: -6, scale: 1.02, rotateX: 2, transition: { duration: 0.3, type: 'spring', stiffness: 400 } } : undefined}
      whileTap={hover ? { scale: 0.98, rotateX: 0 } : undefined}
      className={className}
      style={{ transformPerspective: 1200 }}
    >
      {children}
    </motion.div>
  )
}

export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 240, damping: 22, mass: 0.8 }}
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

export function Tilt3DCard({
  children,
  className,
  glowColor = 'rgba(59, 130, 246, 0.15)',
}: {
  children: React.ReactNode
  className?: string
  glowColor?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = React.useState(0)
  const [rotateY, setRotateY] = React.useState(0)

  const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setRotateX(-y * 12)
    setRotateY(x * 12)
  }, [])

  const handleMouseLeave = React.useCallback(() => {
    setRotateX(0)
    setRotateY(0)
  }, [])

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ rotateX, rotateY }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      style={{
        transformPerspective: 1200,
        transformStyle: 'preserve-3d',
      }}
      className={className}
    >
      {children}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        animate={{
          background: `radial-gradient(circle at ${50 + rotateY * 4}% ${50 - rotateX * 4}%, ${glowColor} 0%, transparent 60%)`,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      />
    </motion.div>
  )
}
