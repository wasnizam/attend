import { useEffect, useMemo, useState } from 'react'
import { fetchManyAttendance, fetchManyClockOuts } from '../data/attendance'
import { fetchManyLeaveTypes } from '../data/evidence'
import { fetchPlans } from '../data/plans'
import { fetchRoster } from '../data/roster'
import { subscribeOrgSessions } from '../data/sessions'
import { weekStart } from '../lib/format'
import { holidayDates } from '../lib/holidays'
import { type PayrollRow, buildPayroll } from '../lib/payroll'
import type { Organisation, Session, WeeklyClass } from '../lib/types'
import { useProfile } from './useAuth'
import { type Live, useLive } from './useLive'
import { useMySessions } from './useSessions'

/**
 * Everyone's days, hours, lateness, overtime and leave between two dates: the sums behind the Pay
 * page and the workplace Overview. An admin sees the whole company; a manager their own offices.
 */
export function usePayrollRows(from: string, to: string, org: Organisation | null, classes: Live<WeeklyClass[]>) {
  const profile = useProfile()
  const mySessions = useMySessions()
  const [rows, setRows] = useState<PayrollRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  // An admin's report covers the whole company: every office, whoever manages it.
  const admin = profile.role === 'admin'
  const orgSessions = useLive<Session[]>(
    admin ? (onData, onError) => subscribeOrgSessions(profile.organisationId, from, to, onData, onError) : null,
    [admin, from, to, profile.organisationId],
  )
  const source = admin ? orgSessions : mySessions
  const held = useMemo(
    () => (source.data ?? []).filter((s) => s.date >= from && s.date <= to && s.status !== 'scheduled'),
    [source.data, from, to],
  )
  const signature = held.map((s) => `${s.id}:${s.presentCount}:${s.status}`).join(',')

  useEffect(() => {
    let stale = false
    setRows(null)
    setFailed(false)
    // Every list this manager keeps, so a department is known even for a day opened without a list.
    const lists = [...new Set([...held.map((s) => s.rosterId), ...(classes.data ?? []).filter((c) => c.rosterCount).map((c) => c.id)].filter((id): id is string => Boolean(id)))]
    Promise.all([
      fetchManyAttendance(held, profile),
      fetchManyClockOuts(held, profile),
      Promise.all(lists.map(async (id) => [id, await fetchRoster(id, profile.organisationId, profile)] as const)),
      // The weekly plans for the lists people rotate on, so a planned day is checked exactly.
      Promise.all(
        [...new Set(held.filter((s) => s.rotating && s.rosterId).map((s) => s.rosterId!))].map((id) =>
          fetchPlans(id, [...new Set(held.filter((s) => s.rosterId === id).map((s) => weekStart(s.date)))], profile).catch(() => []),
        ),
      ),
      // What kind of leave each day off was.
      fetchManyLeaveTypes(held, profile).catch(() => new Map()),
    ]).then(
      ([records, outs, rosters, plans, leave]) =>
        !stale &&
        setRows(
          buildPayroll(
            held,
            records,
            outs,
            new Map(rosters),
            plans.flat(),
            new Map([...held.filter((s) => s.rosterId).map((s) => [s.rosterId!, s.venue || ''] as const), ...(classes.data ?? []).map((c) => [c.id, c.venue || ''] as const)]),
            Date.now(),
            leave,
            // Each list's working days, and the days it was closed (public holidays), for rest-day and holiday hours.
            new Map((classes.data ?? []).map((c) => [c.id, { days: c.days, off: new Set([...Object.keys(c.cancelled ?? {}).map((k) => k.slice(0, 10)), ...holidayDates(c)]) }] as const)),
            org?.otRule ?? 'fullDay',
          ),
        ),
      () => !stale && setFailed(true),
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, from, to, profile.id, classes.data, org?.otRule])
  return { rows, failed, source, held }
}
