import { describe, expect, it } from 'vitest'
import { parseDate } from '../src/lib/format'
import { buildReport, plannedCount } from '../src/lib/report'
import { buildSubjectRows } from '../src/lib/subject'
import type { AttendanceRecord, Session, WeeklyClass } from '../src/lib/types'

// A class every Monday 10:00–12:00, held on six Mondays.
const DATES = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']
const cls = (extra: Partial<WeeklyClass> = {}) =>
  ({ id: 'c1', name: 'Data Structures', code: 'SECJ2013', kind: 'lecture', days: [1], startTime: '10:00', endTime: '12:00', startDate: '2026-09-07', endDate: '2026-12-07', ...extra }) as WeeklyClass
const held = DATES.map((date, i) => ({ id: `s${i}`, date, startTime: '10:00', endTime: '12:00', status: 'ended', expected: null }) as unknown as Session)
const roster = ['A1', 'B2', 'C3'].map((k) => ({ studentKey: k, studentId: k, studentName: `Student ${k}` }))

/** A scan `late` minutes after the start of class number `i`. */
const scan = (key: string, i: number, late = 0, extra: Partial<AttendanceRecord> = {}) =>
  ({
    id: `${key}-${i}`,
    studentKey: key,
    studentId: key,
    studentName: `Student ${key}`,
    status: 'present',
    method: 'qr',
    timestamp: { toMillis: () => parseDate(DATES[i], '10:00').getTime() + late * 60_000 },
    ...extra,
  }) as unknown as AttendanceRecord
const records = (list: [string, number, number?, Partial<AttendanceRecord>?][]) => {
  const map = new Map<string, AttendanceRecord[]>()
  for (const [key, i, late, extra] of list) map.set(`s${i}`, [...(map.get(`s${i}`) ?? []), scan(key, i, late, extra)])
  return map
}
const everyClass = (key: string): [string, number][] => DATES.map((_, i) => [key, i])
const row = (report: ReturnType<typeof buildReport>, key: string) => report.rows.find((r) => r.key === key)!

describe('students who join late or drop the class', () => {
  it('does not count classes before a student joined', () => {
    // B2 registered in week 3 and came to everything since.
    const data = records([...everyClass('A1'), ['B2', 2], ['B2', 3], ['B2', 4], ['B2', 5]])
    expect(row(buildReport(cls(), held, data, roster), 'B2').absent).toBe(2)
    const fair = row(buildReport(cls({ enrol: { B2: { from: '2026-09-21' } } }), held, data, roster), 'B2')
    expect(fair.absent).toBe(0)
    expect(fair.rate).toBe(100)
    expect(fair.level).toBe('ok')
  })

  it('stops counting after a student dropped, and asks for no warning', () => {
    const data = records([...everyClass('A1'), ['C3', 0]])
    const before = row(buildReport(cls(), held, data, roster), 'C3')
    expect(before.absent).toBe(5)
    expect(before.level).toBe('barring')
    const dropped = row(buildReport(cls({ enrol: { C3: { to: '2026-09-10' } } }), held, data, roster), 'C3')
    expect(dropped.absent).toBe(0)
    expect(dropped.level).toBe('ok')
    expect(dropped.to).toBe('2026-09-10')
  })

  it('takes a dropped student out of the headcount for later classes', () => {
    const data = records([...everyClass('A1'), ...everyClass('B2'), ['C3', 0]])
    const report = buildReport(cls({ enrol: { C3: { to: '2026-09-10' } } }), held, data, roster)
    expect(report.trend[0].rate).toBe(100)
    // Two of the two students still enrolled, not two of three.
    expect(report.trend[5].rate).toBe(100)
  })
})

describe('lateness', () => {
  const data = records([['A1', 0, 3], ['B2', 0, 25], ['C3', 0, 40, { method: 'manual' }]])

  it('is only marked by hand unless the lecturer sets the minutes', () => {
    const report = buildReport(cls(), held.slice(0, 1), data, roster)
    expect(report.rows.map((r) => r.late)).toEqual([0, 0, 0])
  })

  it('marks a scan well after the start as late, but never someone added by hand', () => {
    const report = buildReport(cls({ lateAfter: 15 }), held.slice(0, 1), data, roster)
    expect(row(report, 'A1').late).toBe(0)
    expect(row(report, 'B2').late).toBe(1)
    expect(row(report, 'B2').marks.get('s0')).toBe('late')
    expect(row(report, 'C3').late).toBe(0)
    // Late still counts as attended.
    expect(row(report, 'B2').rate).toBe(100)
  })
})

describe('absences in a row', () => {
  it('finds the longest run missed without a reason', () => {
    // A1 misses classes 1, 2 and 3 in a row; B2 misses 1 and 3 with an MC between.
    const data = records([['A1', 0], ['A1', 4], ['A1', 5], ['B2', 0], ['B2', 2, 0, { status: 'mc' }], ['B2', 4], ['B2', 5], ...everyClass('C3')])
    const report = buildReport(cls(), held, data, roster)
    expect(row(report, 'A1').streak).toBe(3)
    expect(row(report, 'B2').streak).toBe(1)
    expect(row(report, 'C3').streak).toBe(0)
  })
})

describe('holidays and breaks', () => {
  it('leaves classes marked as no class out of the semester total', () => {
    expect(plannedCount(cls())).toBe(14)
    expect(plannedCount(cls({ cancelled: { '2026-10-19_1000': 'Mid-semester break', '2026-10-26_1000': 'Mid-semester break' } }))).toBe(12)
  })
})

describe('the whole course, by class hours', () => {
  it('weighs a two-hour lecture twice a one-hour tutorial', () => {
    const lecture = cls()
    const tutorial = cls({ id: 'c2', kind: 'tutorial', endTime: '11:00' })
    const tutHeld = held.map((s) => ({ ...s, id: `t${s.id}`, endTime: '11:00' }) as Session)
    // A1 comes to every lecture and no tutorial: 12 of 18 hours.
    const reports = new Map([
      ['c1', buildReport(lecture, held, records(everyClass('A1')), roster.slice(0, 1))],
      ['c2', buildReport(tutorial, tutHeld, new Map(), roster.slice(0, 1))],
    ])
    const { rows } = buildSubjectRows({ key: 'SECJ2013', code: 'SECJ2013', classes: [lecture, tutorial], kinds: ['lecture', 'tutorial'] }, reports)
    expect(rows[0].byKind.lecture?.rate).toBe(100)
    expect(rows[0].byKind.tutorial?.rate).toBe(0)
    expect(rows[0].overall.attendedHours).toBe(12)
    expect(rows[0].overall.countedHours).toBe(18)
    expect(rows[0].overall.rate).toBe(66.7)
  })
})
