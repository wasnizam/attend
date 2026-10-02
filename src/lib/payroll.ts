import { endOf, minutesLate } from './format'
import type { RosterEntry } from './rosterImport'
import type { AttendanceRecord, Session } from './types'

/** One person's month, in the figures a payroll sheet needs. */
export interface PayrollRow {
  key: string
  staffId: string
  name: string
  department: string
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
}

type Outs = Map<string, { toMillis(): number }>

/** Works out the month from the sessions held in it. Lateness and overtime come from the clock. */
export function buildPayroll(
  sessions: Session[],
  records: Map<string, AttendanceRecord[]>,
  outs: Map<string, Outs>,
  rosters: Map<string, RosterEntry[]>,
): PayrollRow[] {
  const people = new Map<string, PayrollRow>()
  const person = (key: string, staffId: string, name: string) => {
    if (!people.has(key)) {
      people.set(key, { key, staffId, name, department: '', days: 0, minutes: 0, overtime: 0, late: 0, lateMinutes: 0, mc: 0, leave: 0, absent: 0, noClockOut: 0 })
    }
    return people.get(key)!
  }
  for (const list of rosters.values()) {
    for (const s of list) {
      const row = person(s.studentKey, s.studentId, s.studentName)
      if (s.department && !row.department) row.department = s.department
    }
  }
  for (const session of sessions) {
    const seen = new Set<string>()
    const end = endOf(session).getTime()
    for (const r of records.get(session.id) ?? []) {
      seen.add(r.studentKey)
      const row = person(r.studentKey, r.studentId, r.studentName)
      const status = r.status ?? 'present'
      if (status === 'mc') row.mc += 1
      else if (status === 'excused') row.leave += 1
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
          row.minutes += (to - from) / 60_000
          row.overtime += Math.max(0, to - Math.max(end, from)) / 60_000
        } else row.noClockOut += 1
      }
    }
    for (const s of (!session.rotating && session.rosterId && rosters.get(session.rosterId)) || []) {
      if (!seen.has(s.studentKey)) person(s.studentKey, s.studentId, s.studentName).absent += 1
    }
  }
  return [...people.values()].sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
}

/** Minutes as decimal hours, the way a spreadsheet wants them. */
export const hours = (minutes: number) => (minutes / 60).toFixed(2)
