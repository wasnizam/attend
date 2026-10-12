import { afterEach, describe, expect, it, vi } from 'vitest'
import { TRIAL_DAYS, activePlan, allows, limitFor, locksOn, overLimit, overPlan, setPlan, trialDaysLeft } from '../src/lib/plan'
import { setPurpose } from '../src/lib/purpose'

const DAY = 86_400_000
const at = (ms: number) => ({ toMillis: () => ms })
const now = Date.now()

describe('plans', () => {
  it('early access has no limits', () => {
    setPurpose('education')
    setPlan({ plan: 'early' })
    expect(activePlan()).toBe('early')
    expect(overLimit('classes', 50)).toBe(false)
    setPlan({})
    expect(activePlan()).toBe('early')
  })

  it('a trial is Pro for 14 days, then Free', () => {
    setPurpose('education')
    setPlan({ plan: 'trial', trialStarted: at(now - 10 * DAY) })
    expect(activePlan()).toBe('trial')
    expect(trialDaysLeft()).toBe(TRIAL_DAYS - 10)
    expect(overLimit('classes', 5)).toBe(false)
    setPlan({ plan: 'trial', trialStarted: at(now - 15 * DAY) })
    expect(activePlan()).toBe('free')
    expect(overLimit('classes', 1)).toBe(false)
    expect(overLimit('classes', 2)).toBe(true)
  })

  it('Pro ends when the paid period ends', () => {
    setPurpose('training')
    setPlan({ plan: 'pro', paidUntil: at(now + DAY) })
    expect(activePlan()).toBe('pro')
    expect(overLimit('classes', 20)).toBe(false)
    setPlan({ plan: 'pro', paidUntil: at(now - DAY) })
    expect(activePlan()).toBe('free')
    expect(overLimit('classes', 2)).toBe(true)
  })

  it('workplace is limited by staff: 5 free, then the paid size', () => {
    setPurpose('workplace')
    setPlan({ plan: 'free' })
    expect(limitFor('staff')).toBe(5)
    expect(overLimit('staff', 6)).toBe(true)
    expect(overLimit('classes', 10)).toBe(false)
    setPlan({ plan: 'pro', paidUntil: at(now + DAY), seats: 20 })
    expect(overLimit('staff', 20)).toBe(false)
    expect(overLimit('staff', 21)).toBe(true)
  })
})

describe('what the free plan holds back', () => {
  // The limits apply only where customers can pay: here, a browser that is trying payments out.
  const storage = (on: boolean) => vi.stubGlobal('localStorage', { getItem: () => (on ? '1' : null), setItem: () => {} })
  const features = ['pdf', 'export', 'overtime', 'leave', 'offices', 'shifts', 'geofence', 'phoneCheck'] as const
  afterEach(() => vi.unstubAllGlobals())

  it('locks nothing while customers have no way to pay', () => {
    storage(false)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('workplace')
    setPlan({ plan: 'free' })
    expect(locksOn()).toBe(false)
    for (const f of features) expect(allows(f)).toBe(true)
    expect(limitFor('classes')).toBeUndefined()
    // The staff limit of the free plan has always applied.
    expect(limitFor('staff')).toBe(5)
  })

  it('holds the paid features back from a free workplace once payments are open', () => {
    storage(true)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('workplace')
    setPlan({ plan: 'free' })
    for (const f of features) expect(allows(f)).toBe(false)
    expect(limitFor('classes')).toBe(1)
    expect(overLimit('classes', 2)).toBe(true)
  })

  it('gives everything back on a paid plan, a trial, early access, or after a free code', () => {
    storage(true)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('workplace')
    for (const org of [{ plan: 'pro' as const, paidUntil: at(now + DAY), seats: 20 }, { plan: 'trial' as const, trialStarted: at(now - DAY) }, { plan: 'early' as const }]) {
      setPlan(org)
      for (const f of features) expect(allows(f)).toBe(true)
      expect(limitFor('classes')).toBeUndefined()
    }
  })

  it('locks them again when a paid plan runs out', () => {
    storage(true)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('workplace')
    setPlan({ plan: 'pro', paidUntil: at(now - DAY), seats: 20 })
    expect(allows('pdf')).toBe(false)
    expect(limitFor('staff')).toBe(5)
  })

  it('never holds features back from trainers: their free plan is one course', () => {
    storage(true)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('training')
    setPlan({ plan: 'free' })
    for (const f of features) expect(allows(f)).toBe(true)
    expect(limitFor('classes')).toBe(1)
    expect(limitFor('students')).toBeUndefined()
    expect(limitFor('lecturers')).toBeUndefined()
  })

  it('holds downloads back from a free lecturer, with one class of up to 60 students', () => {
    storage(true)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('education')
    setPlan({ plan: 'free' })
    expect(allows('pdf')).toBe(false)
    expect(allows('export')).toBe(false)
    expect(allows('geofence')).toBe(true)
    expect(limitFor('classes')).toBe(1)
    expect(limitFor('students')).toBe(60)
    expect(limitFor('lecturers')).toBe(1)
  })

  it('leaves a free lecturer as before while customers have no way to pay', () => {
    storage(false)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('education')
    setPlan({ plan: 'free' })
    expect(allows('pdf')).toBe(true)
    expect(limitFor('classes')).toBe(1)
    expect(limitFor('students')).toBeUndefined()
    expect(limitFor('sessions')).toBeUndefined()
    // One lecturer: the same as the security rules hold a join to.
    expect(limitFor('lecturers')).toBe(1)
    expect(overPlan({ classes: 9, students: 900 })).toBeNull()
  })

  it('gives one lecturer on Pro ten classes at a time and 300 students in each', () => {
    storage(true)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('education')
    setPlan({ plan: 'pro', paidUntil: { toMillis: () => Date.now() + 86_400_000 } })
    expect(allows('pdf')).toBe(true)
    expect(overLimit('classes', 10)).toBe(false)
    expect(overLimit('classes', 11)).toBe(true)
    expect(limitFor('students')).toBe(300)
    expect(limitFor('lecturers')).toBe(1)
  })

  it('gives a faculty the lecturers it pays for, each with the Pro limits', () => {
    setPurpose('education')
    setPlan({ plan: 'pro', paidUntil: { toMillis: () => Date.now() + 86_400_000 }, seats: 12 })
    expect(limitFor('lecturers')).toBe(12)
    expect(limitFor('classes')).toBe(10)
  })

  it('lets a trial bring colleagues in, and early access has no limits at all', () => {
    setPurpose('education')
    setPlan({ plan: 'trial', trialStarted: { toMillis: () => Date.now() - 86_400_000 } })
    expect(limitFor('lecturers')).toBe(5)
    expect(limitFor('classes')).toBe(10)
    setPlan({})
    for (const kind of ['classes', 'students', 'lecturers', 'staff'] as const) expect(limitFor(kind)).toBeUndefined()
  })

  it('finds an account that holds more than its plan covers, however it got there', () => {
    storage(true)
    vi.stubGlobal('window', { location: { search: '' } })
    const paid = { toMillis: () => Date.now() + 86_400_000 }
    setPurpose('education')
    // Paid for 30 lecturers, then made smaller.
    setPlan({ plan: 'pro', paidUntil: paid, seats: 5, usage: { lecturers: 30 } })
    expect(overPlan()).toEqual({ kind: 'lecturers', have: 30, max: 5 })
    setPlan({ plan: 'pro', paidUntil: paid, seats: 5, usage: { lecturers: 5 } })
    expect(overPlan({ classes: 10, students: 300 })).toBeNull()
    expect(overPlan({ classes: 11 })).toEqual({ kind: 'classes', have: 11, max: 10 })
    expect(overPlan({ classes: 3, students: 301 })).toEqual({ kind: 'students', have: 301, max: 300 })
    // Set up on Pro or a trial, then stopped paying: the free plan's size applies again.
    setPlan({ plan: 'pro', paidUntil: { toMillis: () => Date.now() - 1 }, usage: { lecturers: 1 } })
    expect(overPlan({ classes: 10 })).toEqual({ kind: 'classes', have: 10, max: 1 })
    expect(overPlan({ classes: 1, students: 61 })).toEqual({ kind: 'students', have: 61, max: 60 })
    expect(limitFor('sessions')).toBe(5)
    setPlan({ plan: 'trial', trialStarted: { toMillis: () => Date.now() - 20 * 86_400_000 }, usage: { lecturers: 12 } })
    expect(overPlan({ classes: 1 })).toEqual({ kind: 'lecturers', have: 12, max: 1 })
    // A workplace whose paid plan ended, with more staff than the free plan holds.
    setPurpose('workplace')
    setPlan({ plan: 'free', usage: { staff: 40 } })
    expect(overPlan({ classes: 1 })).toEqual({ kind: 'staff', have: 40, max: 5 })
    setPlan({ plan: 'pro', paidUntil: paid, seats: 50, usage: { staff: 40 } })
    expect(overPlan({ classes: 6 })).toBeNull()
    // Early access is never held back.
    setPlan({ usage: { lecturers: 99, staff: 999 } })
    expect(overPlan({ classes: 99, students: 9999 })).toBeNull()
  })

  it('lets a customer the team has tagged try payments on any device, and nobody else', () => {
    storage(false)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('workplace')
    setPlan({ plan: 'free' })
    expect(locksOn()).toBe(false)
    setPlan({ plan: 'free', tags: ['vip', 'pay-test'] })
    expect(locksOn()).toBe(true)
    expect(allows('pdf')).toBe(false)
    setPlan({ plan: 'free', tags: ['vip'] })
    expect(locksOn()).toBe(false)
  })
})
