'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getTourSteps } from '@/lib/onboarding/tours'
import { WelcomeScreen } from './WelcomeScreen'
import { Spotlight } from './Spotlight'
import { TourCallout } from './TourCallout'

type Phase = 'idle' | 'welcome' | 'touring' | 'done'

async function markOnboardingComplete() {
  try {
    await fetch('/api/users/me/onboarding', { method: 'POST' })
  } catch {
    // Best-effort — worst case the tour shows again next login, not harmful.
  }
}

export function OnboardingTour() {
  const { user } = useAuth()
  const [phase, setPhase] = useState<Phase>('idle')
  const [stepIndex, setStepIndex] = useState(0)

  const steps = useMemo(() => (user ? getTourSteps(user.role) : []), [user])

  useEffect(() => {
    if (!user) return
    // Only ever auto-show once per account — onboarding_completed_at is set
    // on both "finish" and "skip", so there's no separate "seen but skipped" state.
    if (!user.onboarding_completed_at && phase === 'idle') {
      setPhase('welcome')
    }
  }, [user, phase])

  // Manual replay from the Help panel — jumps straight to the spotlight
  // tour (skips the welcome screen; a returning user doesn't need it
  // re-explained), regardless of completion state.
  useEffect(() => {
    const handler = () => {
      setStepIndex(0)
      setPhase('touring')
    }
    window.addEventListener('dlm:replay-tour', handler)
    return () => window.removeEventListener('dlm:replay-tour', handler)
  }, [])

  const finish = useCallback(() => {
    setPhase('done')
    markOnboardingComplete()
  }, [])

  const handleStart = useCallback(() => {
    setStepIndex(0)
    setPhase('touring')
  }, [])

  const handleNext = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= steps.length) {
        finish()
        return i
      }
      return i + 1
    })
  }, [steps.length, finish])

  const handleBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  // A step's target element doesn't exist on this screen size/layout
  // (e.g. sidebar nav item on a narrow viewport) — skip it rather than
  // leaving the tour stuck waiting for something that'll never appear.
  const handleTargetMissing = useCallback(() => {
    handleNext()
  }, [handleNext])

  if (!user || phase === 'idle' || phase === 'done') return null

  if (phase === 'welcome') {
    return (
      <WelcomeScreen
        role={user.role}
        fullName={user.full_name}
        onStart={handleStart}
        onSkip={finish}
      />
    )
  }

  const step = steps[stepIndex]
  if (!step) return null

  return (
    <>
      <Spotlight targetSelector={step.target} onTargetMissing={handleTargetMissing} />
      <TourCallout
        step={step}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        onNext={handleNext}
        onBack={handleBack}
        onSkip={finish}
      />
    </>
  )
}
