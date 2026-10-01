import { addDays, classSlots, countPresent, isoDate, parseDate, percent } from './format'
import type { RosterEntry } from './rosterImport'
import type { AttendanceRecord, AttendanceStatus, Session, WeeklyClass } from './types'

export const DEFAULT_WARN = 10
export const DEFAULT_BAR = 20

/** on_track, or how far along the university's warning / barring ladder a student is. */
export type Level = 'ok' | 'warning' | 'barring'

export interface StudentRow {
  key: string
  studentId: string
  studentName: string
  present: number
  late: number
  excused: number
  /** Absences covered by a medical certificate. */
  mc: number
  /** Absences without a reason: the number the 80% rule is about. */
  absent: number
  /** Share of sessions attended so far, leaving excused and MC ones out. Null when nothing counts yet. */
  rate: number | null
  level: Level
  /** How many more classes the student can miss before barring is due. */
  canMiss: number
  /** Status in each held session, by session ID. Missing means absent. */
  marks: Map<string, AttendanceStatus>
}

export interface ClassReport {
  held: Session[]
  /** Classes in the whole semester, from the timetable. Equals held when there are no semester dates. */
  planned: number
  rows: StudentRow[]
  /** Per session: who was in the room, and the rate against the headcount. */
  trend: { session: Session; present: number; rate: number | null }[]
  average: number | null
  warnAfter: number
  barAfter: number
}

/** How many times the class meets between its semester dates, going by the timetable. */
export function plannedCount(cls: WeeklyClass): number {
  if (!cls.startDate || !cls.endDate || cls.endDate < cls.startDate) return 0
  const perDay = new Map<number, number>()
  for (const slot of classSlots(cls)) perDay.set(slot.day, (perDay.get(slot.day) ?? 0) + 1)
  const called = new Set(Object.keys(cls.cancelled ?? {}))
  let total = 0
  // A semester is a few months: walking it day by day is cheap and obviously right.
  for (let d = cls.startDate; d <= cls.endDate && total < 2000; d = addDays(d, 1)) {
    total += perDay.get(parseDate(d).getDay()) ?? 0
  }
  // Cancelled meetings are not classes a student could have attended.
  for (const slot of classSlots(cls)) {
    for (const key of called) {
      const [date, time] = key.split('_')
      if (time === slot.startTime.replace(':', '') && date >= cls.startDate && date <= cls.endDate && parseDate(date).getDay() === slot.day) total -= 1
    }
  }
  return Math.max(0, total)
}

/**
 * Builds the semester picture for one class. Thresholds follow the usual university
 * rule: a warning once a student has missed `warnPct` of the semester's classes, and
 * barring once they have missed `barPct` (so attendance can no longer reach 80%).
 */
export function buildReport(
  cls: WeeklyClass,
  held: Session[],
  recordsBySession: Map<string, AttendanceRecord[]>,
  roster: RosterEntry[],
): ClassReport {
  const planned = Math.max(plannedCount(cls), held.length)
  const warnAfter = Math.max(1, Math.ceil(((cls.warnPct ?? DEFAULT_WARN) / 100) * planned))
  const barAfter = Math.max(warnAfter + 1, Math.ceil(((cls.barPct ?? DEFAULT_BAR) / 100) * planned))

  const people = new Map<string, StudentRow>()
  const person = (key: string, studentId: string, studentName: string) => {
    if (!people.has(key)) {
      people.set(key, { key, studentId, studentName, present: 0, late: 0, excused: 0, mc: 0, absent: 0, rate: null, level: 'ok', canMiss: 0, marks: new Map() })
    }
    return people.get(key)!
  }
  for (const s of roster) person(s.studentKey, s.studentId, s.studentName)
  for (const session of held) {
    for (const r of recordsBySession.get(session.id) ?? []) {
      const row = person(r.studentKey, r.studentId, r.studentName)
      const status = r.status ?? 'present'
      row[status] += 1
      row.marks.set(session.id, status)
    }
  }
  for (const row of people.values()) {
    row.absent = Math.max(0, held.length - row.present - row.late - row.excused - row.mc)
    row.rate = percent(row.present + row.late, held.length - row.excused - row.mc)
    row.level = row.absent >= barAfter ? 'barring' : row.absent >= warnAfter ? 'warning' : 'ok'
    row.canMiss = Math.max(0, barAfter - 1 - row.absent)
  }

  const order: Record<Level, number> = { barring: 0, warning: 1, ok: 2 }
  const rows = [...people.values()].sort(
    (a, b) => order[a.level] - order[b.level] || b.absent - a.absent || a.studentName.localeCompare(b.studentName),
  )
  const trend = held.map((session) => {
    const present = countPresent(recordsBySession.get(session.id) ?? [])
    // With a class list, the headcount is today's list; otherwise the expected number.
    return { session, present, rate: percent(present, roster.length || session.expected) }
  })
  const rates = trend.map((p) => p.rate).filter((r): r is number => r !== null)
  const average = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null

  return { held, planned, rows, trend, average, warnAfter, barAfter }
}

export const todayIso = () => isoDate()
