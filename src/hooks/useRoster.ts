import { useMemo } from 'react'
import { subscribePlan } from '../data/plans'
import { subscribeRoster } from '../data/roster'
import { weekStart } from '../lib/format'
import type { Absentee } from '../lib/csv'
import type { RosterEntry } from '../lib/rosterImport'
import type { AttendanceRecord, Session, ShiftPlan } from '../lib/types'
import { useProfile } from './useAuth'
import { type Live, useLive } from './useLive'

/** A class's student list, live. Pass null when there is no list. */
export function useRoster(rosterId: string | null | undefined, organisationId: string): Live<RosterEntry[]> {
  const viewer = useProfile()
  return useLive<RosterEntry[]>(
    rosterId ? (onData, onError) => subscribeRoster(rosterId, organisationId, viewer, onData, onError) : null,
    [rosterId, organisationId, viewer.id, viewer.role],
  )
}

/** Students on the session's class list who have not checked in. Empty when there is no list. */
export function useAbsentees(session: Session, records: AttendanceRecord[]): Absentee[] {
  const roster = useRoster(session.rosterId, session.organisationId)
  const viewer = useProfile()
  // People who rotate are only expected on a shift when the week's plan puts them on it. On fixed
  // hours everyone is expected, unless the plan puts them on another shift or gives them the day off.
  const planned = session.rosterId ?? null
  const plan = useLive<ShiftPlan | null>(
    planned ? (onData, onError) => subscribePlan(planned, weekStart(session.date), viewer, onData, onError) : null,
    [planned, session.date, viewer.id, viewer.role],
  )
  return useMemo(() => {
    if (session.rotating && !plan.data) return []
    const due = (key: string) => {
      const cell = plan.data?.cells[key]?.[session.date]
      return session.rotating ? cell === session.classId : !cell || cell === session.classId
    }
    const present = new Set(records.map((r) => r.studentKey))
    return (roster.data ?? [])
      .filter((s) => !present.has(s.studentKey) && due(s.studentKey))
      .map((s) => ({ studentId: s.studentId, studentName: s.studentName, sessionName: session.name, date: session.date }))
  }, [roster.data, records, session.name, session.date, session.rotating, session.classId, plan.data])
}
