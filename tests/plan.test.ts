import { afterEach, describe, expect, it, vi } from 'vitest'
import { TRIAL_DAYS, activePlan, allows, canPay, limitFor, locksOn, overLimit, overPlan, setPlan, solo, trialDaysLeft } from '../src/lib/plan'
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
    // A free workplace is one office with one shift.
    expect(overLimit('classes', 1)).toBe(false)
    expect(overLimit('classes', 2)).toBe(true)
    setPlan({ plan: 'pro', paidUntil: at(now + DAY), seats: 20 })
    expect(overLimit('classes', 10)).toBe(false)
    expect(overLimit('staff', 20)).toBe(false)
    expect(overLimit('staff', 21)).toBe(true)
  })
})

describe('what the free plan holds back', () => {
  // The limits always apply to the free plan, whether or not this browser can start a payment.
  const storage = (on: boolean) => vi.stubGlobal('localStorage', { getItem: () => (on ? '1' : null), setItem: () => {} })
  const features = ['pdf', 'export', 'overtime', 'leave', 'offices', 'shifts', 'geofence', 'phoneCheck'] as const
  afterEach(() => vi.unstubAllGlobals())

  it('applies the free plan’s limits even while there is no way to pay', () => {
    storage(false)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('workplace')
    setPlan({ plan: 'free' })
    expect(locksOn()).toBe(true)
    for (const f of features) expect(allows(f)).toBe(false)
    expect(limitFor('classes')).toBe(1)
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

  it('holds a free lecturer to the same limits while there is no way to pay', () => {
    storage(false)
    vi.stubGlobal('window', { location: { search: '' } })
    setPurpose('education')
    setPlan({ plan: 'free' })
    expect(allows('pdf')).toBe(false)
    expect(limitFor('classes')).toBe(1)
    expect(limitFor('students')).toBe(60)
    expect(limitFor('sessions')).toBe(5)
    expect(limitFor('lecturers')).toBe(1)
    expect(overPlan({ classes: 9 })).toEqual({ kind: 'classes', have: 9, max: 1 })
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
    expect(canPay()).toBe(false)
    setPlan({ plan: 'free', tags: ['vip', 'pay-test'] })
    expect(canPay()).toBe(true)
    setPlan({ plan: 'free', tags: ['vip'] })
    expect(canPay()).toBe(false)
  })

  it('knows one lecturer’s own account from a faculty’s', () => {
    const paid = { toMillis: () => Date.now() + 86_400_000 }
    setPurpose('education')
    for (const org of [{}, { plan: 'free' as const }, { plan: 'pro' as const, paidUntil: paid }, { plan: 'pro' as const, paidUntil: paid, seats: 1 }]) {
      setPlan(org)
      expect(solo()).toBe(true)
    }
    // A faculty: the Faculty plan, a trial, or simply more than one lecturer in the account.
    setPlan({ plan: 'pro', paidUntil: paid, seats: 5 })
    expect(solo()).toBe(false)
    setPlan({ plan: 'trial', trialStarted: { toMillis: () => Date.now() - 86_400_000 } })
    expect(solo()).toBe(false)
    setPlan({ usage: { lecturers: 3 } })
    expect(solo()).toBe(false)
    // A Faculty plan that has run out, with one lecturer left, is one lecturer's account again.
    setPlan({ plan: 'pro', paidUntil: { toMillis: () => Date.now() - 1 }, seats: 5, usage: { lecturers: 1 } })
    expect(solo()).toBe(true)
    // Workplaces and trainers always keep their Admin page.
    for (const purpose of ['workplace', 'training'] as const) {
      setPurpose(purpose)
      setPlan({ plan: 'free' })
      expect(solo()).toBe(false)
    }
  })
})
