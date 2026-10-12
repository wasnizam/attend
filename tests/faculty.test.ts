import { describe, expect, it } from 'vitest'
import { meetingsDue, studentsAtRisk, teachingRecord, thisSemester } from '../src/lib/faculty'
import { classSessionId } from '../src/lib/format'
import type { ClassReport, StudentRow } from '../src/lib/report'
import type { Session, WeeklyClass } from '../src/lib/types'

// 2026-10-05 is a Monday.
const cls = (id: string, ownerId: string, extra: Partial<WeeklyClass> = {}) =>
  ({
    id, organisationId: 'org', ownerId, ownerName: `Dr ${ownerId}`, name: `Course ${id}`, description: '',
    days: [1], slots: [{ day: 1, startTime: '10:00', endTime: '12:00' }], startTime: '10:00', endTime: '12:00',
    startDate: '2026-10-05', endDate: '2026-12-21', ...extra,
  }) as WeeklyClass
const held = (c: WeeklyClass, date: string, status = 'ended') =>
  ({ id: classSessionId(c.id, date, c.slots![0]), classId: c.id, organisationId: 'org', ownerId: c.ownerId, date, startTime: '10:00', endTime: '12:00', status }) as Session

describe('the meetings a class should have held', () => {
  it('counts each timetable slot from the first day to the date asked, and no further than the semester', () => {
    const c = cls('a', 'ali')
    expect(meetingsDue(c, '2026-10-04')).toEqual([])
    expect(meetingsDue(c, '2026-10-05').map((m) => m.date)).toEqual(['2026-10-05'])
    expect(meetingsDue(c, '2026-10-26').map((m) => m.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(meetingsDue(c, '2027-06-01')).toHaveLength(12)
  })

  it('leaves out a meeting the lecturer cancelled, and counts two slots on the same day', () => {
    const c = cls('a', 'ali', { cancelled: { '2026-10-12_1000': 'Public holiday' }, slots: [{ day: 1, startTime: '10:00', endTime: '12:00' }, { day: 1, startTime: '14:00', endTime: '15:00' }] })
    expect(meetingsDue(c, '2026-10-12').map((m) => `${m.date} ${m.slot.startTime}`)).toEqual(['2026-10-05 10:00', '2026-10-05 14:00', '2026-10-12 14:00'])
  })

  it('has nothing to say about a class with no semester dates', () => {
    expect(meetingsDue(cls('a', 'ali', { startDate: null, endDate: null }), '2026-11-01')).toEqual([])
  })
})

describe('whether lecturers are holding their classes', () => {
  const a = cls('a', 'ali')
  const b = cls('b', 'ben')
  const today = '2026-10-26'

  it('sets what was held against what was due, lecturer by lecturer, worst first', () => {
    const sessions = [held(a, '2026-10-05'), held(a, '2026-10-12'), held(a, '2026-10-19'), held(b, '2026-10-05')]
    const [first, second] = teachingRecord([a, b], sessions, today)
    expect(first).toMatchObject({ ownerId: 'ben', due: 3, held: 1, missed: 2 })
    expect(first.rate).toBeCloseTo(33.33, 1)
    expect(first.classes[0].missed.map((m) => m.date)).toEqual(['2026-10-12', '2026-10-19'])
    expect(second).toMatchObject({ ownerId: 'ali', due: 3, held: 3, missed: 0, rate: 100 })
  })

  it('does not hold today’s class against anyone until the day is over, but counts it once held', () => {
    expect(teachingRecord([a], [], today)[0]).toMatchObject({ due: 3, held: 0, missed: 3 })
    expect(teachingRecord([a], [held(a, today, 'active')], today)[0]).toMatchObject({ due: 4, held: 1, missed: 3 })
  })

  it('does not count a session that was only planned, never opened', () => {
    expect(teachingRecord([a], [held(a, '2026-10-05', 'scheduled')], today)[0]).toMatchObject({ held: 0, missed: 3 })
  })

  it('can only report what was held for a class with no dates', () => {
    const loose = cls('c', 'cat', { startDate: null, endDate: null })
    const row = teachingRecord([loose], [held(loose, '2026-10-05'), held(loose, '2026-10-12')], today)[0]
    expect(row).toMatchObject({ due: 2, held: 2, missed: 0 })
    expect(row.classes[0]).toMatchObject({ undated: true, lastHeld: '2026-10-12' })
  })
})

describe('students at risk across the faculty', () => {
  const row = (key: string, level: StudentRow['level'], extra: Partial<StudentRow> = {}) =>
    ({ key, studentId: key, studentName: `Student ${key}`, level, rate: level === 'ok' ? 95 : level === 'warning' ? 85 : 70, absent: level === 'ok' ? 0 : 3, canMiss: 0, ...extra }) as StudentRow
  const report = (rows: StudentRow[]) => ({ rows, held: new Array(10).fill({}) }) as unknown as ClassReport

  it('joins the same student across two lecturers’ classes, barring first, then the most classes', () => {
    const list = studentsAtRisk([
      { cls: cls('a', 'ali'), report: report([row('S1', 'warning'), row('S2', 'ok'), row('S3', 'barring')]) },
      { cls: cls('b', 'ben'), report: report([row('S1', 'warning'), row('S4', 'warning')]) },
    ])
    expect(list.map((s) => [s.key, s.level, s.classes.length])).toEqual([['S3', 'barring', 1], ['S1', 'warning', 2], ['S4', 'warning', 1]])
    expect(list[1].classes.map((c) => c.cls.id)).toEqual(['a', 'b'])
    expect(list[0].classes[0]).toMatchObject({ held: 10, absent: 3 })
  })

  it('takes the worst level, and leaves out someone who dropped the class', () => {
    const list = studentsAtRisk([
      { cls: cls('a', 'ali'), report: report([row('S1', 'warning'), row('S9', 'barring', { to: '2026-10-10' })]) },
      { cls: cls('b', 'ben'), report: report([row('S1', 'barring')]) },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ key: 'S1', level: 'barring' })
    expect(list[0].classes.map((c) => c.level)).toEqual(['barring', 'warning'])
  })
})

describe('this semester’s classes', () => {
  it('keeps running classes, ones just ended, and ones without dates', () => {
    const list = thisSemester([cls('now', 'a'), cls('old', 'a', { endDate: '2026-06-30' }), cls('justdone', 'a', { endDate: '2026-10-10' }), cls('loose', 'a', { endDate: null })], '2026-10-26')
    expect(list.map((c) => c.id)).toEqual(['now', 'justdone', 'loose'])
  })
})
