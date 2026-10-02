import { describe, expect, it } from 'vitest'
import { TRIAL_DAYS, activePlan, limitFor, overLimit, setPlan, trialDaysLeft } from '../src/lib/plan'
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
