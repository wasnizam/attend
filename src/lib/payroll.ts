import { addDays, countedMinutes, endOf, minutesEarly, minutesLate, parseDate } from './format'

/** The Monday that starts the week a date falls in. */
const mondayOf = (date: string) => addDays(date, -((parseDate(date).getDay() + 6) % 7))
import type { RosterEntry } from './rosterImport'
import type { AttendanceRecord, Session, ShiftPlan } from './types'

/** One person's month, in the figures a payroll sheet needs. */
export interface PayrollRow {
  key: string
  staffId: string
  name: string
  department: string
  /** The office (or branch) whose staff list they are on. */
  office: string
  /** Days they clocked in. */
  days: number
  /** Minutes between clock-in and clock-out, added up, overtime included. */
  minutes: number
  /** The part of `minutes` worked after the shift's end time. */
  overtime: number
  late: number
  lateMinutes: number
  mc: number
  leave: number
  /** Shifts they were listed for and did not turn up to, with no MC or leave. */
  absent: number
  /** Days with a clock-in and no clock-out: hours for those days are not counted. */
  noClockOut: number
  /** Days they clocked in to a shift other than the one planned for them. */
  wrongShift: number
  /** Days they clocked out before the end, and by how many minutes in all. */
  early: number
  earlyMinutes: number
  /** `leave`, split by kind. Leave recorded without a kind is under `other`. */
  leaveBy: Record<LeaveKind, number>
}

export type LeaveKind = 'annual' | 'emergency' | 'unpaid' | 'other'

type Outs = Map<string, { toMillis(): number }>

/** Works out the month from the sessions held in it. Lateness and overtime come from the clock. */
export function buildPayroll(
  sessions: Session[],
  records: Map<string, AttendanceRecord[]>,
  outs: Map<string, Outs>,
  rosters: Map<string, RosterEntry[]>,
  /** Weekly shift plans. A planned week is checked day by day; an unplanned one by days per week. */
  plans: ShiftPlan[] = [],
  /** Staff list ID -> the name of the office it belongs to. */
  offices: Map<string, string> = new Map(),
  /** A day still in progress has nobody absent and nobody who "forgot" to clock out yet. */
  now = Date.now(),
  /** Session ID -> staff key -> the kind of leave recorded for that day. */
  leaveTypes: Map<string, Map<string, LeaveKind>> = new Map(),
): PayrollRow[] {
  const people = new Map<string, PayrollRow>()
  const person = (key: string, staffId: string, name: string) => {
    if (!people.has(key)) {
      people.set(key, { key, staffId, name, department: '', office: '', days: 0, minutes: 0, overtime: 0, late: 0, lateMinutes: 0, mc: 0, leave: 0, absent: 0, noClockOut: 0, wrongShift: 0, early: 0, earlyMinutes: 0, leaveBy: { annual: 0, emergency: 0, unpaid: 0, other: 0 } })
    }
    return people.get(key)!
  }
  for (const [listId, list] of rosters) {
    for (const s of list) {
      const row = person(s.studentKey, s.studentId, s.studentName)
      if (s.department && !row.department) row.department = s.department
      if (!row.office) row.office = offices.get(listId) ?? ''
    }
  }
  // A list is a rotating pool when any shift using it rotates. Its people are measured by the
  // week (see below), not shift by shift.
  const pools = new Set(sessions.filter((x) => x.rotating && x.rosterId).map((x) => x.rosterId!))
  for (const session of sessions) {
    const seen = new Set<string>()
    const end = endOf(session).getTime()
    const over = end <= now
    for (const r of records.get(session.id) ?? []) {
      seen.add(r.studentKey)
      const row = person(r.studentKey, r.studentId, r.studentName)
      const status = r.status ?? 'present'
      if (status === 'mc') row.mc += 1
      else if (status === 'excused') {
        row.leave += 1
        row.leaveBy[leaveTypes.get(session.id)?.get(r.studentKey) ?? 'other'] += 1
      }
      else {
        row.days += 1
        const late = r.method === 'manual' ? 0 : minutesLate(r.timestamp, session)
        if (late || status === 'late') {
          row.late += 1
          row.lateMinutes += late
        }
        const out = outs.get(session.id)?.get(r.studentKey)
        if (out && r.timestamp) {
          const from = r.timestamp.toMillis()
          const to = Math.max(from, out.toMillis())
          const gone = minutesEarly(out, session)
          if (gone) {
            row.early += 1
            row.earlyMinutes += gone
          }
          row.minutes += countedMinutes(from, to, session)
          row.overtime += Math.max(0, to - Math.max(end, from)) / 60_000
        } else if (over) row.noClockOut += 1
      }
    }
    for (const s of (over && session.rosterId && !pools.has(session.rosterId) && rosters.get(session.rosterId)) || []) {
      if (!seen.has(s.studentKey)) person(s.studentKey, s.studentId, s.studentName).absent += 1
    }
  }
  for (const pool of pools) {
    const mine = sessions.filter((x) => x.rosterId === pool)
    const perWeek = mine.find((x) => x.daysPerWeek)?.daysPerWeek
    const planned = new Map(plans.filter((p) => p.rosterId === pool).map((p) => [p.week, p.cells]))
    // How many weekdays the pool runs at all, and which dates it was open in each week.
    const weekdays = new Set(mine.map((x) => parseDate(x.date).getDay())).size
    const weeks = new Map<string, Set<string>>()
    for (const x of mine) {
      const key = mondayOf(x.date)
      weeks.set(key, (weeks.get(key) ?? new Set()).add(x.date))
    }
    for (const member of rosters.get(pool) ?? []) {
      const row = person(member.studentKey, member.studentId, member.studentName)
      for (const [week, openDates] of weeks) {
        const cells = planned.get(week)
        if (cells) {
          // Planned week: each day is checked against the shift the person was put on.
          for (const [date, shift] of Object.entries(cells[member.studentKey] ?? {})) {
            const due = mine.find((x) => x.date === date && x.classId === shift)
            if (!due || endOf(due).getTime() > now) continue
            const theirs = mine.filter((x) => x.date === date).flatMap((x) => (records.get(x.id) ?? []).filter((r) => r.studentKey === member.studentKey).map((r) => ({ x, r })))
            if (theirs.length === 0) row.absent += 1
            else if (!theirs.some(({ x }) => x.id === due.id) && theirs.some(({ r }) => r.status !== 'mc' && r.status !== 'excused')) row.wrongShift += 1
          }
          continue
        }
        // A week is only judged once it is over.
        if (!perWeek || parseDate(addDays(week, 7)).getTime() > now) continue
        // A part week (the month's first or last) expects its share of the days, rounded down.
        const expected = Math.min(openDates.size, Math.floor((perWeek * openDates.size) / Math.max(weekdays, perWeek)))
        const accounted = new Set<string>()
        for (const x of mine) {
          if (mondayOf(x.date) === week && (records.get(x.id) ?? []).some((r) => r.studentKey === member.studentKey)) accounted.add(x.date)
        }
        row.absent += Math.max(0, expected - accounted.size)
      }
    }
  }
  return [...people.values()].sort((a, b) => a.office.localeCompare(b.office) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
}

/** Minutes as decimal hours, the way a spreadsheet wants them. */
export const hours = (minutes: number) => (minutes / 60).toFixed(2)
