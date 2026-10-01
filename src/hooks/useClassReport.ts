import { useEffect, useMemo, useState } from 'react'
import { type ClockOuts, fetchClockOuts, fetchSessionAttendance } from '../data/attendance'
import { has } from '../lib/purpose'
import { type ClassReport, buildReport } from '../lib/report'
import type { AttendanceRecord, WeeklyClass } from '../lib/types'
import { useProfile } from './useAuth'
import { useRoster } from './useRoster'
import { useMySessions } from './useSessions'

/** Loads everything a class's semester report needs, and works it out. */
export function useClassReport(cls: WeeklyClass): { report: ClassReport | null; loading: boolean; failed: boolean } {
  const profile = useProfile()
  const mySessions = useMySessions()
  const roster = useRoster(cls.id, cls.organisationId)
  const [records, setRecords] = useState<Map<string, AttendanceRecord[]> | null>(null)
  const [failed, setFailed] = useState(false)
  const [outs, setOuts] = useState<Map<string, ClockOuts> | null>(null)
  const clocking = has('clock')

  // Sessions that belong to this class: its weekly meetings, plus one-off sessions using its list.
  const held = useMemo(
    () =>
      (mySessions.data ?? [])
        .filter((s) => (s.classId === cls.id || s.rosterId === cls.id) && s.status !== 'scheduled')
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [mySessions.data, cls.id],
  )
  // Re-read when a session is added or its stored headcount changes (a correction was made).
  const signature = held.map((s) => `${s.id}:${s.presentCount}:${s.status}`).join(',')

  useEffect(() => {
    let stale = false
    setFailed(false)
    Promise.all([
      Promise.all(held.map(async (s) => [s.id, await fetchSessionAttendance(s, profile)] as const)),
      clocking ? Promise.all(held.map(async (s) => [s.id, await fetchClockOuts(s, profile)] as const)) : null,
    ]).then(
      ([pairs, outPairs]) => {
        if (stale) return
        setOuts(outPairs ? new Map(outPairs) : null)
        setRecords(new Map(pairs))
      },
      () => !stale && setFailed(true),
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, profile.id, clocking])

  const report = useMemo(
    () => (records && !roster.loading ? buildReport(cls, held, records, roster.data ?? [], outs ?? undefined) : null),
    [cls, held, records, outs, roster.loading, roster.data],
  )
  return { report, loading: !report && !failed, failed }
}
