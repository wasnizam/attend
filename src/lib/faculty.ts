import { addDays, classSessionId, classSlots, parseDate } from './format'
import type { ClassReport, Level } from './report'
import type { Session, Slot, WeeklyClass } from './types'

/**
 * What a head of department asks of a whole faculty, worked out from every lecturer's classes:
 * were the classes on the timetable actually held, and which students are in trouble in any of
 * them. Plain logic, tested on its own.
 */

/** One meeting the timetable says should take place. */
export interface Meeting {
  date: string
  slot: Slot
}

/**
 * The meetings of a class that should have happened by the end of `until` (YYYY-MM-DD): each
 * timetable slot on each of its weekdays from the semester's first day, leaving out the ones the
 * lecturer cancelled (a holiday, a break). A class with no semester dates has none: there is
 * nothing to hold it to.
 */
export function meetingsDue(cls: WeeklyClass, until: string): Meeting[] {
  if (!cls.startDate || !cls.endDate || cls.endDate < cls.startDate) return []
  const slots = classSlots(cls)
  const called = cls.cancelled ?? {}
  const last = cls.endDate < until ? cls.endDate : until
  const out: Meeting[] = []
  for (let d = cls.startDate; d <= last && out.length < 2000; d = addDays(d, 1)) {
    const day = parseDate(d).getDay()
    for (const slot of slots) {
      if (slot.day === day && !(`${d}_${slot.startTime.replace(':', '')}` in called)) out.push({ date: d, slot })
    }
  }
  return out
}

export interface ClassTeaching {
  cls: WeeklyClass
  /** Meetings that should have been held by yesterday, plus today's that were. */
  due: number
  held: number
  /** Due meetings with no attendance opened, oldest first. */
  missed: Meeting[]
  /** The date of the latest meeting held, or null when none has been. */
  lastHeld: string | null
  /** No semester dates on the class, so it cannot be checked against a timetable. */
  undated: boolean
}

export interface LecturerTeaching {
  ownerId: string
  name: string
  classes: ClassTeaching[]
  due: number
  held: number
  missed: number
  /** Share of due meetings that were held, 0–100. Null when nothing was due. */
  rate: number | null
}

/** A session counts as held once attendance was opened for it. */
const wasHeld = (s: Pick<Session, 'status'>) => s.status !== 'scheduled'

/**
 * Each class's meetings due against the ones held, grouped by lecturer. Today's meetings only
 * count once held, so nobody is marked as having missed a class that has not started yet.
 */
export function teachingRecord(classes: WeeklyClass[], sessions: Session[], today: string): LecturerTeaching[] {
  const held = new Map<string, Session>()
  for (const s of sessions) if (wasHeld(s)) held.set(s.id, s)
  const byOwner = new Map<string, LecturerTeaching>()
  for (const cls of classes) {
    const meetings = meetingsDue(cls, today)
    const done = meetings.filter((m) => held.has(classSessionId(cls.id, m.date, m.slot)))
    const missed = meetings.filter((m) => m.date < today && !held.has(classSessionId(cls.id, m.date, m.slot)))
    // A class with no dates: all that can be said is what was held.
    const own = sessions.filter((s) => s.classId === cls.id && wasHeld(s))
    const undated = meetings.length === 0 && !(cls.startDate && cls.endDate)
    const row: ClassTeaching = {
      cls,
      due: undated ? own.length : done.length + missed.length,
      held: undated ? own.length : done.length,
      missed,
      lastHeld: own.reduce<string | null>((latest, s) => (!latest || s.date > latest ? s.date : latest), null),
      undated,
    }
    const who = byOwner.get(cls.ownerId) ?? { ownerId: cls.ownerId, name: cls.ownerName, classes: [], due: 0, held: 0, missed: 0, rate: null }
    who.classes.push(row)
    who.due += row.due
    who.held += row.held
    who.missed += row.missed.length
    byOwner.set(cls.ownerId, who)
  }
  const out = [...byOwner.values()]
  for (const who of out) {
    who.rate = who.due > 0 ? (who.held / who.due) * 100 : null
    who.classes.sort((a, b) => b.missed.length - a.missed.length || a.cls.name.localeCompare(b.cls.name))
  }
  // Whoever has missed the most comes first: that is who the head needs to speak to.
  return out.sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name))
}

export interface RiskClass {
  cls: WeeklyClass
  level: Exclude<Level, 'ok'>
  rate: number | null
  absent: number
  /** Classes held so far in this course. */
  held: number
  canMiss: number
}

export interface RiskStudent {
  key: string
  studentId: string
  studentName: string
  /** The worst across their classes. */
  level: Exclude<Level, 'ok'>
  classes: RiskClass[]
}

/**
 * Every student due a warning or barring in at least one class, with all the classes where they
 * are. The same student ID in two lecturers' classes is one student. Barring comes first, then
 * whoever is in trouble in the most classes.
 */
export function studentsAtRisk(reports: { cls: WeeklyClass; report: ClassReport }[]): RiskStudent[] {
  const byKey = new Map<string, RiskStudent>()
  for (const { cls, report } of reports) {
    for (const row of report.rows) {
      // Someone who dropped the class is no longer held to its rule.
      if (row.level === 'ok' || row.to) continue
      const s = byKey.get(row.key) ?? { key: row.key, studentId: row.studentId, studentName: row.studentName, level: row.level, classes: [] }
      s.classes.push({ cls, level: row.level, rate: row.rate, absent: row.absent, held: report.held.length, canMiss: row.canMiss })
      if (row.level === 'barring') s.level = 'barring'
      byKey.set(row.key, s)
    }
  }
  const out = [...byKey.values()]
  for (const s of out) s.classes.sort((a, b) => (a.level === b.level ? (a.rate ?? 0) - (b.rate ?? 0) : a.level === 'barring' ? -1 : 1))
  return out.sort((a, b) => (a.level === b.level ? b.classes.length - a.classes.length || a.studentName.localeCompare(b.studentName) : a.level === 'barring' ? -1 : 1))
}

/** The classes of this semester: still running, or ended within the last month. Undated ones are kept. */
export const thisSemester = (classes: WeeklyClass[], today: string) => classes.filter((c) => !c.endDate || c.endDate >= addDays(today, -30))
