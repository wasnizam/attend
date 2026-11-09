import { describe, expect, it } from 'vitest'
import { holidayDates, holidayPatch, holidaysBetween, signatureFor } from '../src/lib/holidays'
import type { WeeklyClass } from '../src/lib/types'

const DEL = '<delete>'
// A Monday 9:00 class through the 2026 semester.
const cls = (extra: Partial<WeeklyClass> = {}) =>
  ({ id: 'c1', organisationId: 'o', ownerId: 'u', name: 'Data', slots: [{ day: 1, startTime: '09:00', endTime: '11:00' }], days: [1], startTime: '09:00', endTime: '11:00', startDate: '2026-09-01', endDate: '2026-12-31', ...extra }) as WeeklyClass
const opts = (o: Partial<Parameters<typeof holidayPatch>[2]> = {}) => ({ open: false, held: new Set<string>(), label: 'Public holiday', signature: 'sig', sessionIdOf: (d: string, s: { startTime: string }) => `c1_${d}_${s.startTime.replace(':', '')}`, del: DEL, ...o })
// Malaysia Day 2026 is a Wednesday; Deepavali's replacement day is Monday 9 November.
const list = [{ date: '2026-09-16', name: 'Malaysia Day' }, { date: '2026-11-09', name: 'Deepavali' }]

describe('public holidays', () => {
  it('calls off only the meetings that fall on a holiday', () => {
    const p = holidayPatch(cls(), list, opts())
    expect(p['cancelled.2026-11-09_0900']).toBe('Public holiday: Deepavali')
    expect(p['holidayKeys.2026-11-09_0900']).toBe('Public holiday: Deepavali')
    expect(Object.keys(p).some((k) => k.includes('2026-09-16'))).toBe(false)
    expect(p.holidaySync).toBe('sig')
  })

  it('never calls off a class that was held, or one kept on', () => {
    expect(holidayPatch(cls(), list, opts({ held: new Set(['c1_2026-11-09_0900']) }))['cancelled.2026-11-09_0900']).toBeUndefined()
    expect(holidayPatch(cls({ holidayKept: { '2026-11-09_0900': true } }), list, opts())['cancelled.2026-11-09_0900']).toBeUndefined()
  })

  it('a workplace that stays open keeps the day on, but remembers it is a holiday for pay', () => {
    const p = holidayPatch(cls(), list, opts({ open: true }))
    expect(p['cancelled.2026-11-09_0900']).toBeUndefined()
    expect(p['holidayKeys.2026-11-09_0900']).toBeTruthy()
    expect(holidayDates({ holidayKeys: { '2026-11-09_0900': 'x' } })).toEqual(['2026-11-09'])
  })

  it('puts back holidays that no longer apply, unless changed by hand', () => {
    const before = cls({ cancelled: { '2026-11-09_0900': 'Public holiday: Deepavali', '2026-11-16_0900': 'My own reason' }, holidayKeys: { '2026-11-09_0900': 'Public holiday: Deepavali', '2026-11-16_0900': 'Public holiday: X' } })
    const p = holidayPatch(before, [], opts())
    expect(p['cancelled.2026-11-09_0900']).toBe(DEL)
    expect(p['cancelled.2026-11-16_0900']).toBeUndefined()
    expect(p['holidayKeys.2026-11-16_0900']).toBe(DEL)
  })

  it('works out again when the place changes', () => {
    expect(signatureFor(cls(), null)).toBe('none')
    expect(signatureFor(cls(), { country: 'MY', region: '10' })).not.toBe(signatureFor(cls(), { country: 'MY', region: '13' }))
  })

  it('knows Malaysian state holidays and Czech ones', async () => {
    const selangor = await holidaysBetween({ country: 'MY', region: '10' }, '2026-01-01', '2026-12-31')
    expect(selangor.some((h) => h.date === '2026-08-31')).toBe(true)
    expect(selangor.some((h) => h.date === '2026-12-11')).toBe(true) // the Sultan of Selangor's birthday
    const czech = await holidaysBetween({ country: 'CZ' }, '2026-01-01', '2026-12-31')
    expect(czech.some((h) => h.date === '2026-10-28')).toBe(true)
  })
})
