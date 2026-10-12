import { afterEach, describe, expect, it, vi } from 'vitest'
import { limitRows, standingOf } from '../src/console/planUse'
import { limitFor, planLimits, setPlan } from '../src/lib/plan'
import { setPurpose } from '../src/lib/purpose'
import type { Organisation, UserProfile, WeeklyClass } from '../src/lib/types'

const paid = { toMillis: () => Date.now() + 86_400_000 }
const org = (extra: object) => ({ id: 'o', name: 'O', ownerId: 'a', ...extra }) as unknown as Organisation
const user = (id: string, status = 'active') => ({ id, organisationId: 'o', status, name: id }) as unknown as UserProfile
const cls = (id: string, ownerId: string, rosterCount: number, extra: object = {}) =>
  ({ id, organisationId: 'o', ownerId, ownerName: `Dr ${ownerId}`, name: `Course ${id}`, rosterCount, endDate: '2026-12-31', ...extra }) as unknown as WeeklyClass
const today = '2026-10-12'

describe('a plan’s limits for any customer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('are the same numbers the customer’s own app is held to, once payments are open', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1', setItem: () => {} })
    vi.stubGlobal('window', { location: { search: '' } })
    const cases = [
      { purpose: 'education', plan: 'free' },
      { purpose: 'education', plan: 'pro', paidUntil: paid },
      { purpose: 'education', plan: 'pro', paidUntil: paid, seats: 8 },
      { purpose: 'education', plan: 'trial', trialStarted: { toMillis: () => Date.now() - 86_400_000 } },
      { purpose: 'education' },
      { purpose: 'training', plan: 'free' },
      { purpose: 'training', plan: 'pro', paidUntil: paid },
      { purpose: 'workplace', plan: 'free' },
      { purpose: 'workplace', plan: 'pro', paidUntil: paid, seats: 50 },
      { purpose: 'workplace', plan: 'pro', paidUntil: { toMillis: () => Date.now() - 1 }, seats: 50 },
    ] as const
    for (const c of cases) {
      setPurpose(c.purpose)
      setPlan(c)
      const limits = planLimits(c)
      for (const kind of ['classes', 'staff', 'students', 'lecturers', 'sessions'] as const) expect([c.purpose, 'plan' in c ? c.plan : 'early', kind, limits[kind]]).toEqual([c.purpose, 'plan' in c ? c.plan : 'early', kind, limitFor(kind)])
    }
  })

  it('has none on early access', () => {
    expect(planLimits({ purpose: 'workplace' })).toEqual({})
    expect(standingOf(limitRows(org({ purpose: 'education' }), [user('a')], [cls('1', 'a', 400)], today))).toBe('none')
  })
})

describe('what a customer uses of their plan', () => {
  it('finds a faculty that holds more lecturers than it pays for', () => {
    const rows = limitRows(org({ purpose: 'education', plan: 'pro', paidUntil: paid, seats: 5 }), ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((u) => user(u)).concat(user('z', 'disabled')), [], today)
    expect(rows.find((r) => r.kind === 'lecturers')).toMatchObject({ used: 7, max: 5, state: 'over' })
    expect(standingOf(rows)).toBe('over')
  })

  it('counts classes for whoever runs the most, and leaves out the ones that have ended', () => {
    const classes = [...Array.from({ length: 11 }, (_, i) => cls(`a${i}`, 'ali', 30)), cls('b1', 'ben', 30), cls('old', 'ali', 30, { endDate: '2026-06-30' })]
    const rows = limitRows(org({ purpose: 'education', plan: 'pro', paidUntil: paid, seats: 2 }), [user('ali'), user('ben')], classes, today)
    expect(rows.find((r) => r.kind === 'classes')).toMatchObject({ used: 11, max: 10, who: 'Dr ali', state: 'over' })
  })

  it('names the biggest class, and calls a plan nearly used up "near"', () => {
    const rows = limitRows(org({ purpose: 'education', plan: 'pro', paidUntil: paid }), [user('a')], [cls('1', 'a', 250, { code: 'CS101' }), cls('2', 'a', 40)], today)
    expect(rows.find((r) => r.kind === 'students')).toMatchObject({ used: 250, max: 300, who: 'CS101 Course 1', state: 'near' })
    expect(rows.find((r) => r.kind === 'lecturers')).toMatchObject({ used: 1, max: 1, state: 'full' })
    expect(standingOf(rows)).toBe('near')
  })

  it('uses the server’s count of staff when it has one, and the lists otherwise', () => {
    const workplace = { purpose: 'workplace', plan: 'pro', paidUntil: paid, seats: 20 }
    expect(limitRows(org(workplace), [user('a')], [cls('1', 'a', 12), cls('2', 'a', 12)], today).find((r) => r.kind === 'staff')).toMatchObject({ used: 24, state: 'over' })
    expect(limitRows(org({ ...workplace, usage: { staff: 14 } }), [user('a')], [cls('1', 'a', 12), cls('2', 'a', 12)], today).find((r) => r.kind === 'staff')).toMatchObject({ used: 14, state: 'ok' })
  })

  it('shows a free workplace that grew past five staff, and a comfortable one as fine', () => {
    expect(standingOf(limitRows(org({ purpose: 'workplace', plan: 'free' }), [user('a')], [cls('1', 'a', 9)], today))).toBe('over')
    expect(standingOf(limitRows(org({ purpose: 'workplace', plan: 'pro', paidUntil: paid, seats: 50 }), [user('a')], [cls('1', 'a', 9)], today))).toBe('ok')
  })
})
