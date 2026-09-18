import { describe, it, expect } from 'vitest'
import { getTourSteps, getWelcomeCopy, WELCOME_COPY } from '@/lib/onboarding/tours'
import { getFaqForRole } from '@/lib/onboarding/help-content'
import { DELEGATED_ROLES } from '@/types'

// Every role string users.role can actually hold. The delegated VAR roles were
// added to the Postgres enum by 20260818000000 but left out of the onboarding
// content maps, so a VAR user's first login threw while rendering the tour —
// from the dashboard LAYOUT, which no error boundary in the tree catches.
const CORE_ROLES = ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer', 'vendor'] as const
const ALL_ROLES = [...CORE_ROLES, ...DELEGATED_ROLES]

describe('onboarding content covers every role the database can store', () => {
  it.each(ALL_ROLES)('getWelcomeCopy(%s) returns usable copy', (role) => {
    const copy = getWelcomeCopy(role)
    expect(copy).toBeDefined()
    expect(typeof copy.headline).toBe('string')
    expect(copy.headline.length).toBeGreaterThan(0)
    expect(copy.body.length).toBeGreaterThan(0)
  })

  it.each(ALL_ROLES)('getTourSteps(%s) returns steps with no undefined entry', (role) => {
    const steps = getTourSteps(role)
    expect(steps.length).toBeGreaterThan(0)
    for (const s of steps) {
      // An undefined step is what actually crashed the dashboard.
      expect(s).toBeDefined()
      expect(s.target).toBeTruthy()
      expect(s.title).toBeTruthy()
    }
  })

  it.each(DELEGATED_ROLES)('%s has real FAQ content, not an empty list', (role) => {
    const faq = getFaqForRole(role)
    expect(faq.length).toBeGreaterThan(0)
    expect(faq[0].question.length).toBeGreaterThan(0)
    expect(faq[0].answer.length).toBeGreaterThan(0)
  })

  it('WELCOME_COPY itself has an entry for every role', () => {
    for (const role of ALL_ROLES) {
      expect(WELCOME_COPY[role], `missing WELCOME_COPY for ${role}`).toBeDefined()
    }
  })

  // The real defect was a total-function failure, not a missing string: any
  // role the build doesn't know about must degrade, never throw.
  it('degrades gracefully for a role this build has never seen', () => {
    expect(() => getWelcomeCopy('some_future_role')).not.toThrow()
    expect(getWelcomeCopy('some_future_role').headline.length).toBeGreaterThan(0)
    expect(() => getTourSteps('some_future_role')).not.toThrow()
    expect(getTourSteps('some_future_role').every((s) => s !== undefined)).toBe(true)
    expect(getFaqForRole('some_future_role')).toEqual([])
  })
})
