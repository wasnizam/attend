import { KINDS, endOf, parseDate, percent } from './format'
import { type ClassReport, DEFAULT_BAR, counts } from './report'
import type { ClassKind, WeeklyClass } from './types'

/** Classes that share a course code are one subject: its lecture, tutorial and lab. */
export const subjectKey = (c: Pick<WeeklyClass, 'code'>) => (c.code ?? '').trim().toUpperCase().replace(/\s+/g, '')

export interface Subject {
  key: string
  /** The course code as the lecturer typed it. */
  code: string
  classes: WeeklyClass[]
  kinds: ClassKind[]
}

/** Groups classes by course code. Classes without a code are not part of any subject. */
export function subjectsOf(classes: WeeklyClass[]): Subject[] {
  const byKey = new Map<string, WeeklyClass[]>()
  for (const c of classes) {
    const key = subjectKey(c)
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), c])
  }
  return [...byKey.entries()]
    .map(([key, list]) => ({
      key,
      code: list[0].code!.trim(),
      classes: list,
      kinds: KINDS.filter((k) => list.some((c) => (c.kind ?? 'lecture') === k)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

export interface KindFigure {
  attended: number
  /** Classes that count for this student: held, minus excused and MC. */
  counted: number
  rate: number | null
}

export interface SubjectRow {
  key: string
  studentId: string
  studentName: string
  byKind: Partial<Record<ClassKind, KindFigure>>
  /** The student's lowest figure across the types they are enrolled in. */
  lowest: number | null
  /**
   * The whole course as one figure, counted by class hours (a two-hour lecture weighs twice a
   * one-hour tutorial): what universities that apply the rule to the course as a whole look at.
   */
  overall: { attendedHours: number; countedHours: number; rate: number | null }
}

/**
 * One row per student across a subject's classes, with a figure for each class type.
 * A student is matched by student ID. Two classes of the same type (two sections) are
 * added together, though a student is normally in only one.
 */
export function buildSubjectRows(subject: Subject, reports: Map<string, ClassReport>): { rows: SubjectRow[]; required: number } {
  const people = new Map<string, SubjectRow>()
  for (const cls of subject.classes) {
    const report = reports.get(cls.id)
    if (!report) continue
    const kind = cls.kind ?? 'lecture'
    for (const r of report.rows) {
      const row = people.get(r.key) ?? { key: r.key, studentId: r.studentId, studentName: r.studentName, byKind: {}, lowest: null, overall: { attendedHours: 0, countedHours: 0, rate: null } }
      const before = row.byKind[kind] ?? { attended: 0, counted: 0, rate: null }
      const attended = before.attended + r.present + r.late
      const counted = before.counted + r.present + r.late + r.absent
      row.byKind[kind] = { attended, counted, rate: percent(attended, counted) }
      for (const s of report.held) {
        const mark = r.marks.get(s.id)
        // Excused and MC classes are left out, as everywhere else; so are classes outside the student's dates.
        if (mark === 'excused' || mark === 'mc' || !counts(r, s)) continue
        const hours = Math.max(0, endOf(s).getTime() - parseDate(s.date, s.startTime).getTime()) / 3_600_000
        row.overall.countedHours += hours
        if (mark) row.overall.attendedHours += hours
      }
      people.set(r.key, row)
    }
  }
  for (const row of people.values()) {
    const rates = Object.values(row.byKind).map((f) => f.rate).filter((x): x is number => x !== null)
    row.lowest = rates.length ? Math.min(...rates) : null
    row.overall.rate = percent(row.overall.attendedHours, row.overall.countedHours)
  }
  // The strictest requirement among the subject's classes (normally all 80%).
  const required = Math.max(...subject.classes.map((c) => 100 - (c.barPct ?? DEFAULT_BAR)))
  const rows = [...people.values()].sort((a, b) => (a.lowest ?? 101) - (b.lowest ?? 101) || a.studentName.localeCompare(b.studentName))
  return { rows, required }
}
