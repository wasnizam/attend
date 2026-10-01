import { useEffect, useMemo, useState } from 'react'
import { fetchSessionAttendance } from '../data/attendance'
import { fetchRoster } from '../data/roster'
import { type ClassReport, buildReport } from '../lib/report'
import type { WeeklyClass } from '../lib/types'
import { useProfile } from './useAuth'
import { useMySessions } from './useSessions'

/** Loads and works out the report for each of several classes in one go. */
export function useClassReports(classes: WeeklyClass[]): { reports: Map<string, ClassReport> | null; failed: boolean } {
  const profile = useProfile()
  const mySessions = useMySessions()
  const [reports, setReports] = useState<Map<string, ClassReport> | null>(null)
  const [failed, setFailed] = useState(false)

  const heldBy = useMemo(() => {
    const map = new Map<string, NonNullable<typeof mySessions.data>>()
    for (const cls of classes) {
      map.set(
        cls.id,
        (mySessions.data ?? [])
          .filter((s) => (s.classId === cls.id || s.rosterId === cls.id) && s.status !== 'scheduled')
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
      )
    }
    return map
  }, [classes, mySessions.data])
  const signature = classes.map((c) => `${c.id}:${c.rosterCount ?? 0}:${(heldBy.get(c.id) ?? []).map((s) => `${s.id}.${s.presentCount}`).join('|')}`).join(',')

  useEffect(() => {
    if (mySessions.loading) return
    let stale = false
    setFailed(false)
    Promise.all(
      classes.map(async (cls) => {
        const held = heldBy.get(cls.id) ?? []
        const [roster, pairs] = await Promise.all([
          fetchRoster(cls.id, cls.organisationId, profile),
          Promise.all(held.map(async (s) => [s.id, await fetchSessionAttendance(s, profile)] as const)),
        ])
        return [cls.id, buildReport(cls, held, new Map(pairs), roster)] as const
      }),
    ).then(
      (entries) => !stale && setReports(new Map(entries)),
      () => !stale && setFailed(true),
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, profile.id, mySessions.loading])

  return { reports, failed }
}
