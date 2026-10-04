import { addDays, classSlots, countPresent, isoDate, lateFor, parseDate, percent } from './format'
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
  /** Workplace: minutes between clock-in and clock-out, added up. */
  minutes: number
  /** Share of sessions attended so far, leaving excused and MC ones out. Null when nothing counts yet. */
  rate: number | null
  level: Level
  /** How many more classes the student can miss before barring is due. */
  canMiss: number
  /** Status in each held session, by session ID. Missing means absent. */
  marks: Map<string, AttendanceStatus>
  /** Attendance for each calendar month, by month key (YYYY-MM). */
  monthly: Map<string, { attended: number; counted: number; absent: number; rate: number | null }>
}

export interface ReportMonth {
  /** YYYY-MM */
  key: string
  /** Classes held in that month. */
  held: number
  /** Share of the class present, averaged over the month's classes. */
  average: number | null
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
  months: ReportMonth[]
  /** The attendance a student must keep: 100 minus the barring percentage (normally 80). */
  required: number
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
  /** Workplace: clock-out times by session, then by person. Lateness then comes from the clock-in time. */
  outsBySession?: Map<string, Map<string, { toMillis(): number }>>,
): ClassReport {
  const planned = Math.max(plannedCount(cls), held.length)
  const warnAfter = Math.max(1, Math.ceil(((cls.warnPct ?? DEFAULT_WARN) / 100) * planned))
  const barAfter = Math.max(warnAfter + 1, Math.ceil(((cls.barPct ?? DEFAULT_BAR) / 100) * planned))

  const people = new Map<string, StudentRow>()
  const person = (key: string, studentId: string, studentName: string) => {
    if (!people.has(key)) {
      people.set(key, { key, studentId, studentName, present: 0, late: 0, excused: 0, mc: 0, absent: 0, minutes: 0, rate: null, level: 'ok', canMiss: 0, marks: new Map(), monthly: new Map() })
    }
    return people.get(key)!
  }
  for (const s of roster) person(s.studentKey, s.studentId, s.studentName)
  for (const session of held) {
    for (const r of recordsBySession.get(session.id) ?? []) {
      const row = person(r.studentKey, r.studentId, r.studentName)
      let status = r.status ?? 'present'
      if (outsBySession) {
        if (status === 'present' && lateFor(r, session)) status = 'late'
        const out = outsBySession.get(session.id)?.get(r.studentKey)
        if (out && r.timestamp) row.minutes += Math.max(0, (out.toMillis() - r.timestamp.toMillis()) / 60_000)
      }
      row[status] += 1
      row.marks.set(session.id, status)
    }
  }
  for (const row of people.values()) {
    // On a rotating shift nobody is expected every day, so nothing is counted as missed.
    row.absent = cls.rotating ? 0 : Math.max(0, held.length - row.present - row.late - row.excused - row.mc)
    row.rate = cls.rotating ? null : percent(row.present + row.late, held.length - row.excused - row.mc)
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
  // Month by month: the same rule (excused and MC left out), applied to each month's classes.
  const monthKeys = [...new Set(held.map((s) => s.date.slice(0, 7)))].sort()
  const months: ReportMonth[] = monthKeys.map((key) => {
    const inMonth = trend.filter((p) => p.session.date.startsWith(key))
    const known = inMonth.map((p) => p.rate).filter((r): r is number => r !== null)
    for (const row of rows) {
      let attended = 0
      let away = 0
      for (const { session } of inMonth) {
        const mark = row.marks.get(session.id)
        if (mark === 'present' || mark === 'late') attended += 1
        else if (mark === 'excused' || mark === 'mc') away += 1
      }
      const counted = inMonth.length - away
      row.monthly.set(key, { attended, counted, absent: counted - attended, rate: percent(attended, counted) })
    }
    return {
      key,
      held: inMonth.length,
      average: known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null,
    }
  })

  const rates = trend.map((p) => p.rate).filter((r): r is number => r !== null)
  const average = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null

  return { held, planned, rows, trend, average, warnAfter, barAfter, months, required: 100 - (cls.barPct ?? DEFAULT_BAR) }
}

export const todayIso = () => isoDate()
