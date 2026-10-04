import { BREAK_AFTER_MIN, addDays, countedMinutes, earlyFor, endOf, lateFor, parseDate } from './format'

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
  /** Of `days`, those on a rest day or a public holiday: extra days, not part of the attendance rate. */
  extraDays: number
  /** Days worked on each shift (or office hours), by its name. */
  shifts: Record<string, number>
  /** Days worked on a shift that runs past midnight, for a night allowance. */
  nightDays: number
  /** Days clocked in today (or any day not over yet) and not clocked out: still at work, hours to come. */
  openDays: number
  /** Days whose hours are counted (clocked in and out). */
  timedDays: number
  /** Days they clocked in to a shift other than the one planned for them. */
  wrongShift: number
  /** Days they clocked out before the end, and by how many minutes in all. */
  early: number
  earlyMinutes: number
  /** Days they left early with the manager's leave, kept apart from `early`. */
  earlyApproved: number
  /** Half days off (morning or afternoon); each is also a day worked. */
  halfDays: number
  /** `leave`, split by kind. Leave recorded without a kind is under `other`. */
  leaveBy: Record<LeaveKind, number>
  /** Of `minutes`, the hours worked on a rest day, and on a public holiday (paid at other rates). */
  restMinutes: number
  holidayMinutes: number
  /** Days attended out of the days they were due, as a percentage (leave and MC left out). Null when nothing was due. */
  rate: number | null
  /** Each day, for the person's own timesheet and the month grid. */
  entries: DayEntry[]
}

/** One person on one day. */
export interface DayEntry {
  date: string
  sessionId: string
  sessionName: string
  mark: 'present' | 'late' | 'half' | 'leave' | 'mc' | 'absent'
  clockIn?: number
  clockOut?: number
  minutes: number
  late: number
  early: number
  earlyOk?: string
  halfDay?: 'am' | 'pm'
  leaveType?: LeaveKind
  dayType: DayType
  noClockOut: boolean
  /** Clocked in on a day not over yet, not out: still at work. */
  open?: boolean
}

/** Normal working day, the person's rest day, or a public holiday (a day off for everyone). */
export type DayType = 'normal' | 'rest' | 'holiday'

export type LeaveKind = 'annual' | 'emergency' | 'unpaid' | 'other'
export type OvertimeRule = 'fullDay' | 'end'

/** A shift's normal working minutes: start to end, less the unpaid break on a long day. */
export function normalMinutes(session: Pick<Session, 'date' | 'startTime' | 'endTime' | 'breakMin'>) {
  const span = (endOf(session).getTime() - parseDate(session.date, session.startTime).getTime()) / 60_000
  return span > BREAK_AFTER_MIN ? span - (session.breakMin ?? 0) : span
}

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
  /** Working hours (or staff list) -> its working days and its days off (public holidays), to tell rest-day and holiday work apart. */
  calendars: Map<string, { days: number[]; off: Set<string> }> = new Map(),
  /**
   * When a normal day's overtime starts. 'fullDay' (the Employment Act's meaning): only the hours past a
   * full day's normal hours, so coming in late and staying late is not overtime. 'end': any time after
   * the shift's end time.
   */
  otRule: OvertimeRule = 'fullDay',
): PayrollRow[] {
  const people = new Map<string, PayrollRow>()
  const person = (key: string, staffId: string, name: string) => {
    if (!people.has(key)) {
      people.set(key, { key, staffId, name, department: '', office: '', days: 0, minutes: 0, overtime: 0, late: 0, lateMinutes: 0, mc: 0, leave: 0, absent: 0, noClockOut: 0, openDays: 0, timedDays: 0, extraDays: 0, shifts: {}, nightDays: 0, wrongShift: 0, early: 0, earlyMinutes: 0, earlyApproved: 0, halfDays: 0, leaveBy: { annual: 0, emergency: 0, unpaid: 0, other: 0 }, restMinutes: 0, holidayMinutes: 0, rate: null, entries: [] })
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
  // A list is a rotating pool when every shift using it rotates: its people are measured by the week
  // (see below), not shift by shift. A list that also has fixed hours (an office with a night shift
  // beside it) is checked day by day, and a day on any of its shifts accounts for the person.
  const fixed = new Set(sessions.filter((x) => !x.rotating && x.rosterId).map((x) => x.rosterId!))
  const pools = new Set(sessions.filter((x) => x.rotating && x.rosterId && !fixed.has(x.rosterId)).map((x) => x.rosterId!))
  const cameOn = new Map<string, Set<string>>()
  for (const x of sessions) {
    if (!x.rosterId) continue
    const k = `${x.rosterId}|${x.date}`
    const set = cameOn.get(k) ?? new Set<string>()
    for (const r of records.get(x.id) ?? []) set.add(r.studentKey)
    cameOn.set(k, set)
  }
  for (const session of sessions) {
    const seen = new Set<string>()
    const end = endOf(session).getTime()
    const over = end <= now
    // Work on a day off counts apart: rest days and public holidays are paid at other rates.
    // The shift's own calendar first (a night shift runs on its own days), else its list's.
    const cal = calendars.get(session.classId ?? '') ?? (session.rosterId ? calendars.get(session.rosterId) : undefined)
    // A rotating shift has no fixed rest days of its own, but a public holiday is still one.
    const dayType: DayType = !cal ? 'normal' : cal.off.has(session.date) ? 'holiday' : session.rotating || cal.days.includes(parseDate(session.date).getDay()) ? 'normal' : 'rest'
    const night = session.endTime <= session.startTime
    const entry = (r: { studentKey: string; studentId: string; studentName: string }, e: Omit<DayEntry, 'date' | 'sessionId' | 'sessionName' | 'dayType'>) =>
      person(r.studentKey, r.studentId, r.studentName).entries.push({ date: session.date, sessionId: session.id, sessionName: session.name, dayType, ...e })
    for (const r of records.get(session.id) ?? []) {
      seen.add(r.studentKey)
      const row = person(r.studentKey, r.studentId, r.studentName)
      const status = r.status ?? 'present'
      if (status === 'mc') {
        row.mc += 1
        entry(r, { mark: 'mc', minutes: 0, late: 0, early: 0, noClockOut: false })
      } else if (status === 'excused') {
        const kind = leaveTypes.get(session.id)?.get(r.studentKey) ?? 'other'
        row.leave += 1
        row.leaveBy[kind] += 1
        entry(r, { mark: 'leave', leaveType: kind, minutes: 0, late: 0, early: 0, noClockOut: false })
      }
      else {
        row.days += 1
        if (dayType !== 'normal') row.extraDays += 1
        row.shifts[session.name] = (row.shifts[session.name] ?? 0) + 1
        if (night) row.nightDays += 1
        if (r.halfDay) row.halfDays += 1
        const late = lateFor(r, session)
        if (late || (status === 'late' && r.halfDay !== 'am')) {
          row.late += 1
          row.lateMinutes += late
        }
        const out = outs.get(session.id)?.get(r.studentKey)
        let counted = 0
        let gone = 0
        if (out && r.timestamp) {
          const from = r.timestamp.toMillis()
          const to = Math.max(from, out.toMillis())
          gone = earlyFor(r, out, session)
          if (gone && r.earlyOk) row.earlyApproved += 1
          else if (gone) {
            row.early += 1
            row.earlyMinutes += gone
          }
          counted = countedMinutes(from, to, session)
          row.minutes += counted
          row.timedDays += 1
          if (dayType === 'rest') row.restMinutes += counted
          else if (dayType === 'holiday') row.holidayMinutes += counted
          // Overtime on a normal day; on a rest day or holiday every hour is already counted apart.
          else row.overtime += otRule === 'end' ? Math.max(0, to - Math.max(end, from)) / 60_000 : r.halfDay ? 0 : Math.max(0, counted - normalMinutes(session))
        } else if (over) row.noClockOut += 1
        else row.openDays += 1
        entry(r, {
          mark: r.halfDay ? 'half' : late || (status === 'late' && r.halfDay !== 'am') ? 'late' : 'present',
          clockIn: r.timestamp?.toMillis(),
          clockOut: out?.toMillis(),
          minutes: counted,
          late,
          early: gone,
          earlyOk: r.earlyOk,
          halfDay: r.halfDay,
          noClockOut: !out && over,
          open: !out && !over,
        })
      }
    }
    // Nobody is due on a rest day or a public holiday, so missing one is not an absence.
    // A rotating shift beside fixed hours expects nobody in particular: only the fixed hours do.
    for (const s of (over && dayType === 'normal' && !session.rotating && session.rosterId && !pools.has(session.rosterId) && rosters.get(session.rosterId)) || []) {
      // Accounted for by any shift on the list that day, or planned off / onto another shift.
      const cell = plans.find((p) => p.rosterId === session.rosterId && p.week === mondayOf(session.date))?.cells[s.studentKey]?.[session.date]
      if (cell === 'off') continue
      if (!seen.has(s.studentKey) && !cameOn.get(`${session.rosterId}|${session.date}`)?.has(s.studentKey)) {
        person(s.studentKey, s.studentId, s.studentName).absent += 1
        entry(s, { mark: 'absent', minutes: 0, late: 0, early: 0, noClockOut: false })
      }
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
            if (theirs.length === 0) {
              row.absent += 1
              row.entries.push({ date, sessionId: due.id, sessionName: due.name, dayType: 'normal', mark: 'absent', minutes: 0, late: 0, early: 0, noClockOut: false })
            }
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
  for (const row of people.values()) {
    // Only working days count: coming in on a rest day or holiday does not make up for an absence.
    const worked = row.days - row.extraDays
    row.rate = worked + row.absent ? Math.round((worked / (worked + row.absent)) * 1000) / 10 : null
    row.entries.sort((a, b) => a.date.localeCompare(b.date) || (a.clockIn ?? 0) - (b.clockIn ?? 0))
  }
  return [...people.values()].sort((a, b) => a.office.localeCompare(b.office) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
}

/** Minutes as decimal hours, the way a spreadsheet wants them. */
export const hours = (minutes: number) => (minutes / 60).toFixed(2)
