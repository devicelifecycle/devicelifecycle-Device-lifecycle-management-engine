'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import Image from 'next/image'

const DEVICE_BUBBLES = [
  {
    id: 'b1',
    x: '8%',
    yStart: '12%',
    size: 80,
    delay: 0,
    device: {
      src: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=160&q=90',
      w: 44,
      h: 88,
      type: 'phone',
    },
  },
  {
    id: 'b2',
    x: '78%',
    yStart: '15%',
    size: 90,
    delay: 0.3,
    device: {
      src: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=160&q=90',
      w: 48,
      h: 96,
      type: 'phone',
    },
  },
  {
    id: 'b3',
    x: '22%',
    yStart: '15%',
    size: 100,
    delay: 0.6,
    device: {
      src: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=240&q=90',
      w: 100,
      h: 66,
      type: 'laptop',
    },
  },
  {
    id: 'b4',
    x: '85%',
    yStart: '25%',
    size: 70,
    delay: 0.9,
    device: {
      src: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=160&q=90',
      w: 40,
      h: 80,
      type: 'phone',
    },
  },
  {
    id: 'b5',
    x: '5%',
    yStart: '55%',
    size: 85,
    delay: 1.2,
    device: {
      src: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=240&q=90',
      w: 90,
      h: 60,
      type: 'laptop',
    },
  },
  {
    id: 'b6',
    x: '72%',
    yStart: '60%',
    size: 75,
    delay: 1.5,
    device: {
      src: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=160&q=90',
      w: 42,
      h: 84,
      type: 'phone',
    },
  },
]

const DECOR_BUBBLES = [
  { x: '12%', y: '8%', size: 28, opacity: 0.65 },
  { x: '88%', y: '12%', size: 36, opacity: 0.6 },
  { x: '35%', y: '5%', size: 22, opacity: 0.55 },
  { x: '92%', y: '35%', size: 30, opacity: 0.5 },
  { x: '6%', y: '35%', size: 24, opacity: 0.55 },
  { x: '55%', y: '12%', size: 32, opacity: 0.5 },
  { x: '70%', y: '8%', size: 20, opacity: 0.6 },
  { x: '18%', y: '70%', size: 34, opacity: 0.5 },
  { x: '95%', y: '75%', size: 26, opacity: 0.5 },
  { x: '42%', y: '85%', size: 22, opacity: 0.45 },
]

function DeviceBubble({ item, scrollY }: { item: (typeof DEVICE_BUBBLES)[0]; scrollY: import('framer-motion').MotionValue<number> }) {
  const bubbleY = useTransform(scrollY, [0, 600, 1200], [0, 80, 160])
  const burstProgress = useTransform(scrollY, [50 + item.delay * 60, 250 + item.delay * 50, 450], [0, 0.5, 1])
  const bubbleScale = useTransform(burstProgress, [0, 0.5, 1], [1, 1.15, 0.85])
  const bubbleOpacity = useTransform(burstProgress, [0, 0.4, 1], [1, 0.6, 0])
  const boxRotation = useTransform(burstProgress, [0, 0.5, 1], [0, 5, 25])
  const boxSkew = useTransform(burstProgress, [0, 0.5, 1], [0, 2, 8])
  const phoneY = useTransform(burstProgress, [0, 0.3, 0.6, 1], [0, -20, -50, -80])
  const phoneScale = useTransform(burstProgress, [0, 0.25, 0.5, 1], [0.6, 0.9, 1.1, 1.2])
  const phoneOpacity = useTransform(burstProgress, [0, 0.2, 0.5], [0, 0.8, 1])
  const crackOpacity = useTransform(burstProgress, [0.2, 0.5], [0, 1])
  const crackPath1 = useTransform(burstProgress, [0.2, 0.6], [0, 1])
  const crackPath2 = useTransform(burstProgress, [0.3, 0.7], [0, 1])

  const isPhone = item.device.type === 'phone'

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: item.x,
        top: item.yStart,
        width: item.size,
        height: item.size,
        y: bubbleY,
      }}
    >
      {/* Bubble / box container */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-cyan-400/50 bg-gradient-to-br from-cyan-500/30 via-violet-500/20 to-transparent backdrop-blur-md shadow-[0_0_40px_-8px_rgba(34,211,238,0.4),0_0_0_1px_rgba(255,255,255,0.1)]"
        style={{
          scale: bubbleScale,
          opacity: bubbleOpacity,
          rotate: boxRotation,
          skewX: boxSkew,
        }}
      >
        {/* Crack / burst lines - appear as burst happens */}
        <motion.div
          className="absolute inset-0 overflow-hidden rounded-2xl"
          style={{ opacity: crackOpacity }}
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <motion.path
              d="M 50 10 L 55 50 L 50 90"
              fill="none"
              stroke="rgba(34,211,238,0.5)"
              strokeWidth="0.8"
              style={{ pathLength: crackPath1 }}
            />
            <motion.path
              d="M 50 20 L 20 55 L 80 60"
              fill="none"
              stroke="rgba(139,92,246,0.4)"
              strokeWidth="0.6"
              style={{ pathLength: crackPath2 }}
            />
          </svg>
        </motion.div>
      </motion.div>

      {/* Phone / device pops out */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          y: phoneY,
          scale: phoneScale,
          opacity: phoneOpacity,
        }}
      >
        <div
          className={`overflow-hidden shadow-2xl ${isPhone ? 'rounded-[1.2rem]' : 'rounded-md'}`}
          style={{
            width: item.device.w,
            height: item.device.h,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          <Image
            src={item.device.src}
            alt="Device"
            width={item.device.w}
            height={item.device.h}
            className={`object-cover w-full h-full ${isPhone ? 'rounded-[1.2rem]' : 'rounded-md'}`}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}

export function ScrollParallaxBubbles() {
  const { scrollY } = useScroll()

  // Parallax for decorative bubbles
  const decorY1 = useTransform(scrollY, [0, 800], [0, 120])
  const decorY2 = useTransform(scrollY, [0, 1000], [0, 80])
  const decorY3 = useTransform(scrollY, [0, 600], [0, 150])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Decorative ambient bubbles - fall with scroll */}
      {DECOR_BUBBLES.map((b, i) => {
        const yTransform = i % 3 === 0 ? decorY1 : i % 3 === 1 ? decorY2 : decorY3
        return (
          <motion.div
            key={b.x + b.y}
            className="absolute rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-400/30 border border-cyan-400/25 shadow-[0_0_20px_-5px_rgba(34,211,238,0.3)]"
            style={{
              left: b.x,
              top: b.y,
              width: b.size,
              height: b.size,
              opacity: b.opacity,
              y: yTransform,
            }}
          />
        )
      })}

      {/* Device bubbles - burst and phone pops out */}
      {DEVICE_BUBBLES.map((item) => (
        <DeviceBubble key={item.id} item={item} scrollY={scrollY} />
      ))}
    </div>
  )
}
