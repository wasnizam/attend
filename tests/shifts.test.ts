import { describe, expect, it } from 'vitest'
import { endOf, minutesLate } from '../src/lib/format'
import { buildPayroll as build } from '../src/lib/payroll'

// The figures are judged after the month is over.
const LATER = new Date('2027-01-01T00:00:00').getTime()
const buildPayroll = (sessions: never[], records: Map<string, never[]>, outs: Map<string, Map<string, never>>, rosters: Map<string, never[]>, plans: never[] = [], offices = new Map<string, string>()) =>
  build(sessions, records, outs, rosters as never, plans, offices, LATER)

const at = (date: string, time: string) => {
  const ms = new Date(`${date}T${time}:00`).getTime()
  return { toMillis: () => ms, toDate: () => new Date(ms) } as never
}

describe('shift patterns', () => {
  it('a night shift ends the next day', () => {
    const end = endOf({ date: '2026-10-01', startTime: '22:00', endTime: '06:00' })
    expect([end.getDate(), end.getHours()]).toEqual([2, 6])
    expect(endOf({ date: '2026-10-01', startTime: '09:00', endTime: '17:00' }).getDate()).toBe(1)
  })

  it('lateness follows the shift\'s own grace, and flexible hours are never late', () => {
    const day = { date: '2026-10-01', startTime: '09:00' }
    expect(minutesLate(at('2026-10-01', '09:08'), day)).toBe(0)
    expect(minutesLate(at('2026-10-01', '09:08'), { ...day, graceMin: 5 })).toBe(8)
    expect(minutesLate(at('2026-10-01', '09:01'), { ...day, graceMin: 0 })).toBe(1)
    expect(minutesLate(at('2026-10-01', '09:20'), { ...day, graceMin: 30 })).toBe(0)
    expect(minutesLate(at('2026-10-01', '11:00'), { ...day, flexible: true })).toBe(0)
  })

  it('overtime on a night shift counts from the next morning; rotating staff are never absent', () => {
    const night = { id: 'n1', date: '2026-10-01', startTime: '22:00', endTime: '06:00', rosterId: 'pool', rotating: true } as never
    const rows = buildPayroll(
      [night],
      new Map([['n1', [{ studentKey: 'E1', studentId: 'E1', studentName: 'Ahmad', status: 'present', method: 'qr', timestamp: at('2026-10-01', '22:00') } as never]]]),
      new Map([['n1', new Map([['E1', at('2026-10-02', '07:00')]])]]),
      new Map([['pool', [
        { studentKey: 'E1', studentId: 'E1', studentName: 'Ahmad' },
        { studentKey: 'E2', studentId: 'E2', studentName: 'Siti' },
      ]]]),
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(Math.round(by.E1.minutes)).toBe(540)
    expect(Math.round(by.E1.overtime)).toBe(60)
    expect(by.E2.absent).toBe(0)
  })
})

describe('people who rotate are measured by the week', () => {
  const pool = [
    { studentKey: 'E1', studentId: 'E1', studentName: 'Ahmad' },
    { studentKey: 'E2', studentId: 'E2', studentName: 'Siti' },
  ]
  // Monday 5 Oct to Sunday 11 Oct 2026, a morning and a night shift every day.
  const dates = ['05', '06', '07', '08', '09', '10', '11'].map((d) => `2026-10-${d}`)
  const sessions = dates.flatMap((date) => [
    { id: `m${date}`, date, startTime: '06:00', endTime: '14:00', rosterId: 'pool', rotating: true, daysPerWeek: 6 },
    { id: `n${date}`, date, startTime: '22:00', endTime: '06:00', rosterId: 'pool', rotating: true, daysPerWeek: 6 },
  ]) as never[]
  const came = (key: string, date: string, time: string, extra = {}) =>
    ({ studentKey: key, studentId: key, studentName: key, status: 'present', method: 'qr', timestamp: at(date, time), ...extra }) as never

  it('six days on any mix of shifts is a full week; fewer is counted, MC is not', () => {
    const records = new Map<string, never[]>()
    // Ahmad: nights Mon-Sat (6 days). Siti: mornings Mon-Wed, MC on Thursday, then nothing.
    dates.slice(0, 6).forEach((d) => records.set(`n${d}`, [came('E1', d, '22:00')]))
    dates.slice(0, 3).forEach((d) => records.set(`m${d}`, [came('E2', d, '06:00')]))
    records.set(`m${dates[3]}`, [came('E2', dates[3], '06:00', { status: 'mc', method: 'manual' })])
    const rows = buildPayroll(sessions, records, new Map(), new Map([['pool', pool]]))
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.E1.days).toBe(6)
    expect(by.E1.absent).toBe(0)
    expect(by.E2.days).toBe(3)
    expect(by.E2.mc).toBe(1)
    expect(by.E2.absent).toBe(2)
  })
})

describe('a planned week is checked day by day', () => {
  const pool = [{ studentKey: 'E1', studentId: 'E1', studentName: 'Ahmad' }, { studentKey: 'E2', studentId: 'E2', studentName: 'Siti' }]
  const day = (id: string, date: string, shift: string, start: string, end: string) =>
    ({ id, date, startTime: start, endTime: end, rosterId: 'pool', classId: shift, rotating: true, daysPerWeek: 6 }) as never
  const sessions = [
    day('m5', '2026-10-05', 'morning', '06:00', '14:00'), day('n5', '2026-10-05', 'night', '22:00', '06:00'),
    day('m6', '2026-10-06', 'morning', '06:00', '14:00'), day('n6', '2026-10-06', 'night', '22:00', '06:00'),
  ]
  const came = (key: string, date: string, time: string) => ({ studentKey: key, studentId: key, studentName: key, status: 'present', method: 'qr', timestamp: at(date, time) }) as never
  const plan = { id: 'p', organisationId: 'o', ownerId: 'u', rosterId: 'pool', week: '2026-10-05', cells: {
    E1: { '2026-10-05': 'morning', '2026-10-06': 'morning', '2026-10-07': 'off' },
    E2: { '2026-10-05': 'night', '2026-10-06': 'night' },
  } }

  it('absent on the planned day, and a clock-in to the other shift is noted', () => {
    const rows = buildPayroll(
      sessions,
      new Map([['m5', [came('E1', '2026-10-05', '06:00')]], ['n6', [came('E1', '2026-10-06', '22:00'), came('E2', '2026-10-06', '22:00')]]]),
      new Map(),
      new Map([['pool', pool]]),
      [plan],
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.E1.absent).toBe(0)
    expect(by.E1.wrongShift).toBe(1)
    expect(by.E2.absent).toBe(1)
    expect(by.E2.wrongShift).toBe(0)
  })
})
