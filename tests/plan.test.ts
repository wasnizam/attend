import { afterEach, describe, expect, it, vi } from 'vitest'
import { TRIAL_DAYS, activePlan, allows, limitFor, locksOn, overLimit, setPlan, trialDaysLeft } from '../src/lib/plan'
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
    expect(limitFor('lecturers')).toBeUndefined()
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
    expect(limitFor('lecturers')).toBeUndefined()
    expect(limitFor('classes')).toBe(10)
    setPlan({})
    for (const kind of ['classes', 'students', 'lecturers', 'staff'] as const) expect(limitFor(kind)).toBeUndefined()
  })
})
