import { describe, expect, it } from 'vitest'
import { buildPayroll as build } from '../src/lib/payroll'

// The figures are judged after the month is over.
const LATER = new Date('2027-01-01T00:00:00').getTime()
const buildPayroll = (sessions: never[], records: Map<string, never[]>, outs: Map<string, Map<string, never>>, rosters: Map<string, never[]>, plans: never[] = [], offices = new Map<string, string>()) =>
  build(sessions, records, outs, rosters as never, plans, offices, LATER)

const at = (date: string, time: string) => {
  const ms = new Date(`${date}T${time}:00`).getTime()
  return { toMillis: () => ms, toDate: () => new Date(ms) }
}
const session = (id: string, date: string) => ({ id, date, startTime: '09:00', endTime: '18:00', rosterId: 'shift' }) as never
const rec = (key: string, date: string, time: string, extra = {}) =>
  ({ studentKey: key, studentId: key, studentName: key, status: 'present', method: 'qr', timestamp: at(date, time), ...extra }) as never
const roster = new Map([['shift', [
  { studentKey: 'E1', studentId: 'E1', studentName: 'Ahmad', department: 'Sales' },
  { studentKey: 'E2', studentId: 'E2', studentName: 'Siti', department: 'Store' },
  { studentKey: 'E3', studentId: 'E3', studentName: 'Kumar', department: 'Store' },
]]])

describe('monthly payroll figures', () => {
  const rows = buildPayroll(
    [session('d1', '2026-10-01'), session('d2', '2026-10-02')],
    new Map([
      ['d1', [rec('E1', '2026-10-01', '08:55'), rec('E2', '2026-10-01', '09:25'), rec('E3', '2026-10-01', '09:00', { status: 'mc', method: 'manual' })]],
      ['d2', [rec('E1', '2026-10-02', '09:00'), rec('E2', '2026-10-02', '09:00', { status: 'excused', method: 'manual' })]],
    ]),
    new Map([
      ['d1', new Map([['E1', at('2026-10-01', '19:30')], ['E2', at('2026-10-01', '18:00')]])],
      ['d2', new Map()],
    ]),
    roster,
  )
  const by = Object.fromEntries(rows.map((r) => [r.key, r]))

  it('adds up hours and splits out overtime after the shift ends', () => {
    expect(by.E1.days).toBe(2)
    expect(Math.round(by.E1.minutes)).toBe(635)
    expect(Math.round(by.E1.overtime)).toBe(90)
    expect(by.E1.noClockOut).toBe(1)
  })

  it('counts lateness from the clock, and MC, leave and absence apart', () => {
    expect(by.E2.late).toBe(1)
    expect(by.E2.lateMinutes).toBe(25)
    expect(by.E2.leave).toBe(1)
    expect(by.E2.absent).toBe(0)
    expect(by.E3.mc).toBe(1)
    expect(by.E3.absent).toBe(1)
    expect(by.E3.days).toBe(0)
  })

  it('carries the office of the list each person is on', () => {
    const withOffice = buildPayroll([session('d1', '2026-10-01')], new Map(), new Map(), roster, [], new Map([['shift', 'Penang branch']]))
    expect(withOffice.every((r) => r.office === 'Penang branch')).toBe(true)
  })

  it('carries the department from the staff list and sorts by it', () => {
    expect(rows.map((r) => r.department)).toEqual(['Sales', 'Store', 'Store'])
  })
})

describe('a working day that is not over yet', () => {
  it('counts nobody absent and nobody without a clock-out', () => {
    const rows = build(
      [session('d1', '2026-10-01')] as never,
      new Map([['d1', [rec('E1', '2026-10-01', '08:55')]]]),
      new Map([['d1', new Map()]]),
      roster as never,
      [],
      new Map(),
      new Date('2026-10-01T12:00:00').getTime(),
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.E1.days).toBe(1)
    expect(by.E1.noClockOut).toBe(0)
    expect(by.E2.absent).toBe(0)
  })
})

describe('unpaid break', () => {
  const withBreak = (id: string, date: string) => ({ ...(session(id, date) as object), breakMin: 60 }) as never
  it('comes off a long day only, and never off overtime', () => {
    const rows = buildPayroll(
      [withBreak('d1', '2026-10-01'), withBreak('d2', '2026-10-02')],
      new Map([['d1', [rec('E1', '2026-10-01', '09:00')]], ['d2', [rec('E1', '2026-10-02', '09:00')]]]),
      new Map([['d1', new Map([['E1', at('2026-10-01', '19:00')]])], ['d2', new Map([['E1', at('2026-10-02', '13:00')]])]]),
      roster,
    )
    const e1 = rows.find((r) => r.key === 'E1')!
    // Day one: 10 h less 1 h break = 9 h, of which 1 h is overtime. Day two: 4 h, no break taken off.
    expect(Math.round(e1.minutes)).toBe(540 + 240)
    expect(Math.round(e1.overtime)).toBe(60)
  })
})
