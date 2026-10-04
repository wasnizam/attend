import { describe, expect, it } from 'vitest'
import { buildPayroll as build } from '../src/lib/payroll'

// The figures are judged after the month is over.
const LATER = new Date('2027-01-01T00:00:00').getTime()
const buildPayroll = (sessions: never[], records: Map<string, never[]>, outs: Map<string, Map<string, never>>, rosters: Map<string, never[]>, plans: never[] = [], offices = new Map<string, string>(), leave = new Map<string, Map<string, never>>()) =>
  build(sessions, records, outs, rosters as never, plans, offices, LATER, leave)

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
    // In at 08:55 for a 09:00 start: the five minutes before the start are not hours.
    expect(Math.round(by.E1.minutes)).toBe(630)
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

describe('early arrival, early leaving and kinds of leave', () => {
  it('counts the time before the start only when the company asks for it', () => {
    const early = { ...(session('d1', '2026-10-01') as object), countEarly: true } as never
    const rows = buildPayroll([early], new Map([['d1', [rec('E1', '2026-10-01', '08:00')]]]), new Map([['d1', new Map([['E1', at('2026-10-01', '18:00')]])]]), roster)
    expect(Math.round(rows.find((r) => r.key === 'E1')!.minutes)).toBe(600)
    const plain = buildPayroll([session('d1', '2026-10-01')], new Map([['d1', [rec('E1', '2026-10-01', '08:00')]]]), new Map([['d1', new Map([['E1', at('2026-10-01', '18:00')]])]]), roster)
    expect(Math.round(plain.find((r) => r.key === 'E1')!.minutes)).toBe(540)
  })

  it('flags leaving more than the grace before the end', () => {
    const rows = buildPayroll(
      [session('d1', '2026-10-01')],
      new Map([['d1', [rec('E1', '2026-10-01', '09:00'), rec('E2', '2026-10-01', '09:00')]]]),
      new Map([['d1', new Map([['E1', at('2026-10-01', '16:30')], ['E2', at('2026-10-01', '17:55')]])]]),
      roster,
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect([by.E1.early, by.E1.earlyMinutes]).toEqual([1, 90])
    expect(by.E2.early).toBe(0)
  })

  it('splits leave by kind', () => {
    const rows = buildPayroll(
      [session('d1', '2026-10-01'), session('d2', '2026-10-02')],
      new Map([
        ['d1', [rec('E1', '2026-10-01', '09:00', { status: 'excused', method: 'manual' })]],
        ['d2', [rec('E1', '2026-10-02', '09:00', { status: 'excused', method: 'manual' })]],
      ]),
      new Map(),
      roster,
      [],
      new Map(),
      new Map([['d1', new Map([['E1', 'unpaid' as never]])]]),
    )
    const e1 = rows.find((r) => r.key === 'E1')!
    expect(e1.leave).toBe(2)
    expect(e1.leaveBy).toEqual({ annual: 0, emergency: 0, unpaid: 1, other: 1 })
  })
})

describe('allowed early leave and half days', () => {
  it('keeps an allowed early leave apart, and a half day is neither late nor early', () => {
    const rows = buildPayroll(
      [session('d1', '2026-10-01'), session('d2', '2026-10-02')],
      new Map([
        ['d1', [rec('E1', '2026-10-01', '09:00', { earlyOk: 'clinic' }), rec('E2', '2026-10-01', '13:00', { halfDay: 'am' })]],
        ['d2', [rec('E1', '2026-10-02', '09:00', { halfDay: 'pm' })]],
      ]),
      new Map([
        ['d1', new Map([['E1', at('2026-10-01', '15:00')], ['E2', at('2026-10-01', '18:00')]])],
        ['d2', new Map([['E1', at('2026-10-02', '13:00')]])],
      ]),
      roster,
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect([by.E1.early, by.E1.earlyApproved, by.E1.halfDays]).toEqual([0, 1, 1])
    expect([by.E2.late, by.E2.halfDays]).toEqual([0, 1])
  })
})

describe('what HR needs on top of the totals', () => {
  // Monday to Friday; 2 Oct 2026 was a public holiday; 3 Oct is a Saturday.
  const calendars = new Map([['shift', { days: [1, 2, 3, 4, 5], off: new Set(['2026-10-02']) }]])
  const rows = build(
    [session('thu', '2026-10-01'), session('hol', '2026-10-02'), session('sat', '2026-10-03')],
    new Map([
      ['thu', [rec('E1', '2026-10-01', '09:00'), rec('E2', '2026-10-01', '09:20')]],
      ['hol', [rec('E1', '2026-10-02', '09:00')]],
      ['sat', [rec('E1', '2026-10-03', '09:00')]],
    ]) as never,
    new Map([
      ['thu', new Map([['E1', at('2026-10-01', '19:00')]])],
      ['hol', new Map([['E1', at('2026-10-02', '13:00')]])],
      ['sat', new Map([['E1', at('2026-10-03', '12:00')]])],
    ]) as never,
    roster as never,
    [],
    new Map(),
    LATER,
    new Map(),
    calendars,
  )
  const by = Object.fromEntries(rows.map((r) => [r.key, r]))

  it('keeps work on a rest day and a public holiday apart from normal overtime', () => {
    expect(Math.round(by.E1.overtime)).toBe(60)
    expect(Math.round(by.E1.holidayMinutes)).toBe(240)
    expect(Math.round(by.E1.restMinutes)).toBe(180)
    // Days on a rest day or holiday are worked, but kept out of the attendance rate.
    expect(by.E1).toMatchObject({ days: 3, extraDays: 2 })
  })

  it('gives an attendance rate from days worked out of days due', () => {
    expect(by.E1.rate).toBe(100)
    // Siti came on the one working day; the holiday and the Saturday were not due.
    expect(by.E2.rate).toBe(100)
    expect(by.E3.rate).toBe(0)
  })

  it('lists each day for the timesheet and month grid', () => {
    expect(by.E2.entries.map((e) => [e.date, e.mark])).toEqual([
      ['2026-10-01', 'late'],
    ])
    expect(by.E3.entries.map((e) => e.mark)).toEqual(['absent'])
    expect(by.E1.entries[1]).toMatchObject({ dayType: 'holiday', minutes: 240 })
  })
})

describe('hours that are not in yet', () => {
  it('tells days still at work apart from days with no clock-out', () => {
    const now = new Date('2026-10-02T12:00:00').getTime()
    const rows = build(
      [session('old', '2026-10-01'), session('today', '2026-10-02')],
      new Map([
        ['old', [rec('E1', '2026-10-01', '09:00'), rec('E2', '2026-10-01', '09:00')]],
        ['today', [rec('E1', '2026-10-02', '09:00')]],
      ]) as never,
      new Map([['old', new Map([['E1', at('2026-10-01', '17:00')]])]]) as never,
      roster as never,
      [],
      new Map(),
      now,
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.E1).toMatchObject({ days: 2, timedDays: 1, openDays: 1, noClockOut: 0 })
    expect(by.E2).toMatchObject({ days: 1, timedDays: 0, openDays: 0, noClockOut: 1 })
    expect(by.E1.entries[1].open).toBe(true)
  })
})

describe('office hours with a rotating night shift on the same list', () => {
  const day = (id: string, date: string) => ({ id, date, startTime: '09:00', endTime: '18:00', rosterId: 'shift', classId: 'office' }) as never
  const night = (id: string, date: string) => ({ id, date, startTime: '22:00', endTime: '06:00', rosterId: 'shift', classId: 'night', rotating: true, name: 'Night shift' }) as never
  const rows = build(
    [day('d1', '2026-10-01'), night('n1', '2026-10-01')],
    new Map([
      ['d1', [rec('E1', '2026-10-01', '09:00')]],
      ['n1', [rec('E2', '2026-10-01', '21:55')]],
    ]) as never,
    new Map([['n1', new Map([['E2', at('2026-10-02', '06:05')]])]]) as never,
    roster as never,
    [],
    new Map(),
    LATER,
    new Map(),
    new Map([['office', { days: [1, 2, 3, 4, 5], off: new Set<string>() }], ['night', { days: [0, 1, 2, 3, 4, 5, 6], off: new Set<string>() }]]),
  )
  const by = Object.fromEntries(rows.map((r) => [r.key, r]))

  it('still counts someone absent who came to neither', () => {
    expect(by.E3.absent).toBe(1)
  })

  it('does not count the night worker absent from the day, nor the day worker from the night', () => {
    expect(by.E2.absent).toBe(0)
    expect(by.E1.absent).toBe(0)
  })

  it('counts night shifts for an allowance, and hours across midnight', () => {
    expect(by.E2.nightDays).toBe(1)
    expect(by.E2.shifts).toEqual({ 'Night shift': 1 })
    // From the 22:00 start to the 06:05 clock-out the next morning (no unpaid break set here).
    expect(Math.round(by.E2.minutes)).toBe(485)
  })
})

describe('the shift plan on fixed hours', () => {
  it('does not count someone absent on a day the plan gives them off', () => {
    const rows = build(
      [{ id: 'd1', date: '2026-10-01', startTime: '09:00', endTime: '18:00', rosterId: 'shift', classId: 'office' } as never, { id: 'n1', date: '2026-10-01', startTime: '22:00', endTime: '06:00', rosterId: 'shift', classId: 'night', rotating: true } as never],
      new Map([['d1', [rec('E1', '2026-10-01', '09:00')]], ['n1', []]]) as never,
      new Map() as never,
      roster as never,
      [{ id: 'p', organisationId: 'o', ownerId: 'm', rosterId: 'shift', week: '2026-09-28', cells: { E2: { '2026-10-01': 'off' }, E3: { '2026-10-01': 'night' } } }] as never,
      new Map(),
      LATER,
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.E2.absent).toBe(0)
    // Planned on the night shift and came to nothing that day: absent once, not twice.
    expect(by.E3.absent).toBe(1)
  })
})
