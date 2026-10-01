import { useMemo } from 'react'
import { subscribeRoster } from '../data/roster'
import type { Absentee } from '../lib/csv'
import type { RosterEntry } from '../lib/rosterImport'
import type { AttendanceRecord, Session } from '../lib/types'
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
  return useMemo(() => {
    const present = new Set(records.map((r) => r.studentKey))
    return (roster.data ?? [])
      .filter((s) => !present.has(s.studentKey))
      .map((s) => ({ studentId: s.studentId, studentName: s.studentName, sessionName: session.name, date: session.date }))
  }, [roster.data, records, session.name, session.date])
}
