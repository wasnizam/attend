import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { subscribeSessionAttendance } from '../data/attendance'
import { endSession, subscribeMySessions } from '../data/sessions'
import { countPresent, effectiveStatus } from '../lib/format'
import type { AttendanceRecord, Session, UserProfile } from '../lib/types'
import { useProfile } from './useAuth'
import { type Live, useLive } from './useLive'

const SessionsContext = createContext<Live<Session[]>>({ data: undefined, loading: true, error: null })

/** One shared listener for the lecturer's sessions, used by Today and History. */
export function MySessionsProvider({ children }: { children: ReactNode }) {
  const profile = useProfile()
  const live = useLive<Session[]>(
    (onData, onError) => subscribeMySessions(profile, onData, onError),
    [profile.id, profile.organisationId],
  )

  // Sessions whose QR window lapsed without anyone pressing End get closed properly
  // the next time their owner opens the app, so the final count is stored.
  const closing = useRef(new Set<string>())
  useEffect(() => {
    for (const s of live.data ?? []) {
      if (s.status === 'active' && effectiveStatus(s) === 'ended' && !closing.current.has(s.id)) {
        closing.current.add(s.id)
        endSession(s).catch(() => closing.current.delete(s.id))
      }
    }
  }, [live.data])

  return <SessionsContext.Provider value={live}>{children}</SessionsContext.Provider>
}

export const useMySessions = () => useContext(SessionsContext)

export function useSessionAttendance(
  session: Pick<Session, 'id' | 'organisationId'> | null,
  viewer: UserProfile,
): Live<AttendanceRecord[]> {
  return useLive<AttendanceRecord[]>(
    session ? (onData, onError) => subscribeSessionAttendance(session, viewer, onData, onError) : null,
    [session?.id, session?.organisationId, viewer.id, viewer.role],
  )
}

/** Present count for a card: live while the session is running, stored once it has ended. */
export function usePresentCount(session: Session, viewer: UserProfile): number {
  const running = effectiveStatus(session) === 'active'
  const live = useSessionAttendance(running ? session : null, viewer)
  return running && live.data ? countPresent(live.data) : session.presentCount
}

/** Re-renders on an interval so time-based status (QR expiry, "today") stays fresh. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
