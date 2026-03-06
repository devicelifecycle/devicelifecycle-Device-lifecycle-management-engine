'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

const PHONE_SRC = 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=200&q=90'

export function UnboxingAnimation() {
  return (
    <motion.div
      className="relative w-[220px] h-[200px] flex items-end justify-center"
      style={{ perspective: 800 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 3.5, duration: 0.6 }}
    >
      {/* Box base */}
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[160px] h-[90px] rounded-b-lg overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #8B7355 0%, #6B5344 40%, #5C4637 100%)',
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Box inner - darker interior */}
        <div
          className="absolute inset-2 rounded-md"
          style={{ background: 'linear-gradient(180deg, #4A3728 0%, #2D2218 100%)' }}
        />
      </motion.div>

      {/* Box lid - flips open */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 w-[160px] origin-bottom"
        style={{ bottom: 90, transformStyle: 'preserve-3d' }}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: -95 }}
        transition={{
          delay: 4,
          duration: 0.7,
          ease: [0.34, 1.56, 0.64, 1],
        }}
      >
        <div
          className="w-full h-[50px] rounded-t-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(180deg, #A08060 0%, #8B7355 50%, #6B5344 100%)',
            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {/* Tape strip */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-4 -rotate-12 rounded-sm opacity-90"
            style={{ background: 'linear-gradient(90deg, #fef3c7, #fde68a)' }}
          />
        </div>
      </motion.div>

      {/* Phone - pops out from inside box */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10"
        initial={{ y: 55, scale: 0.85, opacity: 0.8 }}
        animate={{
          y: -95,
          scale: 1,
          opacity: 1,
        }}
        transition={{
          delay: 4.5,
          duration: 0.55,
          type: 'spring',
          stiffness: 320,
          damping: 16,
        }}
      >
        <motion.div
          className="overflow-hidden rounded-[1.4rem] shadow-2xl"
          style={{
            width: 90,
            height: 180,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
          }}
          animate={{
            y: [0, -4, 0],
          }}
          transition={{
            delay: 5.4,
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Image
            src={PHONE_SRC}
            alt="Phone"
            width={90}
            height={180}
            className="object-cover w-full h-full rounded-[1.4rem]"
          />
        </motion.div>
      </motion.div>

      {/* Glow under phone when it pops */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 bottom-8 w-24 h-8 rounded-full blur-xl -z-10"
        style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.4) 0%, transparent 70%)' }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.8, 0.3], scale: [0.5, 1.2, 1] }}
        transition={{
          delay: 4.5,
          duration: 1.2,
        }}
      />
    </motion.div>
  )
}
