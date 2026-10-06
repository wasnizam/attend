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
  /** Joined the class on this date (YYYY-MM-DD): earlier classes are not counted for them. */
  from?: string
  /** Dropped the class on this date: later classes are not counted, and no warning is due. */
  to?: string
  /** The longest run of classes in a row missed without a reason. */
  streak: number
  /** Attendance for each calendar month, by month key (YYYY-MM). */
  monthly: Map<string, { attended: number; counted: number; absent: number; rate: number | null }>
}

/** Absences in a row at which a student is flagged, whatever their percentage. */
export const STREAK_FLAG = 3

/**
 * Whether a class counts for this student: always when they were marked in it, otherwise only
 * between the dates they joined and dropped.
 */
export const counts = (row: Pick<StudentRow, 'from' | 'to' | 'marks'>, session: Pick<Session, 'id' | 'date'>) =>
  row.marks.has(session.id) || ((!row.from || session.date >= row.from) && (!row.to || session.date <= row.to))

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
      people.set(key, { key, studentId, studentName, present: 0, late: 0, excused: 0, mc: 0, absent: 0, minutes: 0, rate: null, level: 'ok', canMiss: 0, streak: 0, marks: new Map(), monthly: new Map(), ...(cls.enrol?.[key] ?? {}) })
    }
    return people.get(key)!
  }
  for (const s of roster) person(s.studentKey, s.studentId, s.studentName)
  for (const session of held) {
    for (const r of recordsBySession.get(session.id) ?? []) {
      const row = person(r.studentKey, r.studentId, r.studentName)
      let status = r.status ?? 'present'
      // Classes: a scan well after the start is late, when the lecturer has set how many minutes.
      if (!outsBySession && cls.lateAfter != null && status === 'present' && r.method !== 'manual' && r.timestamp) {
        if ((r.timestamp.toMillis() - parseDate(session.date, session.startTime).getTime()) / 60_000 > cls.lateAfter) status = 'late'
      }
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
    // Only the classes held while the student was enrolled count for them.
    const mine = held.filter((s) => counts(row, s))
    row.absent = cls.rotating ? 0 : Math.max(0, mine.length - row.present - row.late - row.excused - row.mc)
    row.rate = cls.rotating ? null : percent(row.present + row.late, mine.length - row.excused - row.mc)
    // Someone who has dropped the class is not chased with warnings.
    row.level = row.to ? 'ok' : row.absent >= barAfter ? 'barring' : row.absent >= warnAfter ? 'warning' : 'ok'
    row.canMiss = Math.max(0, barAfter - 1 - row.absent)
    let run = 0
    for (const s of mine) {
      run = cls.rotating || row.marks.has(s.id) ? 0 : run + 1
      row.streak = Math.max(row.streak, run)
    }
  }

  const order: Record<Level, number> = { barring: 0, warning: 1, ok: 2 }
  const rows = [...people.values()].sort(
    (a, b) => Number(!!a.to) - Number(!!b.to) || order[a.level] - order[b.level] || b.absent - a.absent || a.studentName.localeCompare(b.studentName),
  )
  const listed = new Set(roster.map((r) => r.studentKey))
  const trend = held.map((session) => {
    const present = countPresent(recordsBySession.get(session.id) ?? [])
    // With a class list, the headcount is everyone enrolled on that day; otherwise the expected number.
    const enrolled = rows.filter((r) => listed.has(r.key) && counts(r, session)).length
    return { session, present, rate: percent(present, enrolled || session.expected) }
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
      const counted = inMonth.filter((p) => counts(row, p.session)).length - away
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
