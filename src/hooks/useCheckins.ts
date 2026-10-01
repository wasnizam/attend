import { subscribeCheckins } from '../data/attendance'
import { isAway } from '../lib/format'
import type { AttendanceRecord, Session } from '../lib/types'
import { useProfile } from './useAuth'
import { useLive } from './useLive'

/** Who confirmed each "still here?" check for a session. Idle until a check has been run. */
export function useCheckins(session: Session) {
  const viewer = useProfile()
  const ran = (session.checkpointCount ?? 0) > 0
  return useLive<Map<number, Set<string>>>(
    ran ? (onData, onError) => subscribeCheckins(session, viewer, onData, onError) : null,
    [session.id, session.organisationId, viewer.id, viewer.role, ran],
  )
}

/** Students who could have answered a check: checked in by phone, before it closed, not excused. */
export const askedInCheck = (r: AttendanceRecord, closedAt: number) =>
  r.method !== 'manual' && !isAway(r.status) && (r.timestamp?.toMillis() ?? 0) < closedAt

/**
 * For each record, the finished checks the student did not answer.
 * A check still open is not counted against anyone yet.
 */
export function missedChecks(session: Session, records: AttendanceRecord[], confirmed: Map<number, Set<string>> | undefined, now: number) {
  const missed = new Map<string, number[]>()
  const times = session.checkpointTimes ?? []
  times.forEach((closedAt, i) => {
    if (closedAt > now) return
    for (const r of records) {
      if (askedInCheck(r, closedAt) && !confirmed?.get(i + 1)?.has(r.studentKey)) {
        missed.set(r.id, [...(missed.get(r.id) ?? []), i + 1])
      }
    }
  })
  return missed
}
