import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorNote, PageLoader, Stat, buttonClass, inputClass } from '../components/ui'
import { fetchClockOuts, fetchSessionAttendance } from '../data/attendance'
import { LEAVE_LABEL, fetchLeaveTypes } from '../data/evidence'
import { fetchPlans } from '../data/plans'
import { fetchRoster } from '../data/roster'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
import { useLive } from '../hooks/useLive'
import { useMySessions } from '../hooks/useSessions'
import { subscribeOrgSessions } from '../data/sessions'
import type { Session } from '../lib/types'
import { downloadCsv } from '../lib/csv'
import { formatDuration, isoDate, weekStart } from '../lib/format'
import { t } from '../lib/i18n'
import { type PayrollRow, buildPayroll, hours } from '../lib/payroll'

const LEAVE_KINDS = ['annual', 'emergency', 'unpaid', 'other'] as const
const SHORT_LEAVE = { annual: 'annual', emergency: 'emergency', unpaid: 'unpaid', other: 'other' }

const csvCell = (v: string | number) => {
  const s = String(v)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** A month of clocking for everyone, by department: the sheet that goes to payroll. */
export function Payroll() {
  const profile = useProfile()
  const mySessions = useMySessions()
  const classes = useMyClasses()
  const [month, setMonth] = useState(isoDate().slice(0, 7))
  const [department, setDepartment] = useState('')
  const [office, setOffice] = useState('')
  const [rows, setRows] = useState<PayrollRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  // An admin's report covers the whole company: every office, whoever manages it.
  const admin = profile.role === 'admin'
  const orgSessions = useLive<Session[]>(
    admin ? (onData, onError) => subscribeOrgSessions(profile.organisationId, `${month}-01`, `${month}-31`, onData, onError) : null,
    [admin, month, profile.organisationId],
  )
  const source = admin ? orgSessions : mySessions
  const held = useMemo(
    () => (source.data ?? []).filter((s) => s.date.startsWith(month) && s.status !== 'scheduled'),
    [source.data, month],
  )
  const signature = held.map((s) => `${s.id}:${s.presentCount}:${s.status}`).join(',')

  useEffect(() => {
    let stale = false
    setRows(null)
    setFailed(false)
    // Every list this manager keeps, so a department is known even for a day opened without a list.
    const lists = [...new Set([...held.map((s) => s.rosterId), ...(classes.data ?? []).filter((c) => c.rosterCount).map((c) => c.id)].filter((id): id is string => Boolean(id)))]
    Promise.all([
      Promise.all(held.map(async (s) => [s.id, await fetchSessionAttendance(s, profile)] as const)),
      Promise.all(held.map(async (s) => [s.id, await fetchClockOuts(s, profile)] as const)),
      Promise.all(lists.map(async (id) => [id, await fetchRoster(id, profile.organisationId, profile)] as const)),
      // The weekly plans for the lists people rotate on, so a planned day is checked exactly.
      Promise.all(
        [...new Set(held.filter((s) => s.rotating && s.rosterId).map((s) => s.rosterId!))].map((id) =>
          fetchPlans(id, [...new Set(held.filter((s) => s.rosterId === id).map((s) => weekStart(s.date)))], profile).catch(() => []),
        ),
      ),
      // What kind of leave each day off was.
      Promise.all(held.map(async (s) => [s.id, await fetchLeaveTypes(s, profile).catch(() => new Map())] as const)),
    ]).then(
      ([records, outs, rosters, plans, leave]) =>
        !stale &&
        setRows(buildPayroll(held, new Map(records), new Map(outs), new Map(rosters), plans.flat(), new Map([...held.filter((s) => s.rosterId).map((s) => [s.rosterId!, s.venue || ''] as const), ...(classes.data ?? []).map((c) => [c.id, c.venue || ''] as const)]), Date.now(), new Map(leave))),
      () => !stale && setFailed(true),
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, month, profile.id, classes.data])

  if (source.loading || classes.loading) return <PageLoader />

  const departments = [...new Set((rows ?? []).map((r) => r.department).filter(Boolean))]
  const offices = [...new Set((rows ?? []).map((r) => r.office).filter(Boolean))]
  const shown = (rows ?? []).filter((r) => (!department || r.department === department) && (!office || r.office === office))
  const sum = (list: PayrollRow[], field: 'minutes' | 'overtime' | 'late' | 'absent') => list.reduce((a, r) => a + r[field], 0)
  // Grouped by office first when there is more than one, then by department.
  const label = (r: PayrollRow) => [offices.length > 1 ? r.office : '', r.department].filter(Boolean).join(' · ')
  const groups = [...new Set(shown.map(label))].map((name) => ({ name, list: shown.filter((r) => label(r) === name) }))

  const exportCsv = () =>
    downloadCsv(
      `payroll-${month}${department ? `-${department.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}-excel.csv`,
      [
        ['Office', 'Department', 'Student ID', 'Student Name', 'Days worked', 'Hours', 'Overtime hours', 'Late', 'Late minutes', 'Left early', 'Early minutes', 'MC', 'Excused', ...LEAVE_KINDS.map((k) => LEAVE_LABEL[k]), 'Absent', 'No clock-out', 'Wrong shift'].map((h) => t(h)),
        ...shown.map((r) => [r.office, r.department, r.staffId, r.name, r.days, hours(r.minutes), hours(r.overtime), r.late, Math.round(r.lateMinutes), r.early, Math.round(r.earlyMinutes), r.mc, r.leave, ...LEAVE_KINDS.map((k) => r.leaveBy[k]), r.absent, r.noClockOut, r.wrongShift]),
      ]
        .map((line) => line.map(csvCell).join(','))
        .join('\r\n') + '\r\n',
      true,
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Monthly report')}</h1>
          <p className="text-sm text-muted">{t('Days, hours, overtime and lateness for each person. Ready for payroll.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/history" className={buttonClass({ variant: 'secondary' })}>{t('Day by day')}</Link>
          <Button disabled={shown.length === 0} onClick={exportCsv}>{t('Export for Excel')}</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="block text-xs font-medium text-muted">
          {t('Month')}
          <input type="month" value={month} max={isoDate().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        {offices.length > 1 && (
          <label className="block text-xs font-medium text-muted">
            {t('Office')}
            <select value={office} onChange={(e) => setOffice(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">{t('All offices')}</option>
              {offices.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
        )}
        {departments.length > 0 && (
          <label className="block text-xs font-medium text-muted">
            {t('Department')}
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">{t('All departments')}</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {failed ? (
        <ErrorNote>{t('The report could not be loaded. Check your connection and reload.')}</ErrorNote>
      ) : !rows ? (
        <PageLoader />
      ) : shown.length === 0 ? (
        <EmptyState title={t('Nothing recorded this month')} text={t('Once people clock in, their days and hours appear here.')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('People')} value={shown.length} />
            <Stat label={t('Hours')} value={formatDuration(sum(shown, 'minutes'))} />
            <Stat label={t('Overtime')} value={formatDuration(sum(shown, 'overtime'))} />
            <Stat label={t('Late')} value={sum(shown, 'late')} />
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-muted">
                <tr>
                  <th className="py-2.5 pr-2 pl-5 font-medium">{t('Student ID')}</th>
                  <th className="px-2 py-2.5 font-medium">{t('Name')}</th>
                  {['Days worked', 'Hours', 'Overtime', 'Late', 'Left early', 'MC', 'Excused', 'Absent'].map((h) => (
                    <th key={h} className="px-2 py-2.5 text-right font-medium last:pr-5">{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {groups.map((g) => (
                  <Fragment key={g.name}>
                    {(departments.length > 0 || offices.length > 1 || g.name) && (
                      <tr className="bg-slate-50/70 text-xs font-semibold">
                        <td colSpan={3} className="py-2 pr-2 pl-5">{g.name || t('No department')} <span className="font-normal text-muted">· {g.list.length}</span></td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">{formatDuration(sum(g.list, 'minutes'))}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">{formatDuration(sum(g.list, 'overtime'))}</td>
                        <td className="px-2 py-2 text-right">{sum(g.list, 'late')}</td>
                        <td colSpan={3} />
                        <td className="py-2 pr-5 pl-2 text-right">{sum(g.list, 'absent')}</td>
                      </tr>
                    )}
                    {g.list.map((r) => (
                      <tr key={r.key}>
                        <td className="py-2.5 pr-2 pl-5 font-medium whitespace-nowrap">{r.staffId}</td>
                        <td className="px-2 py-2.5 break-words">{r.name}</td>
                        <td className="px-2 py-2.5 text-right">
                          {r.days}
                          {r.wrongShift > 0 && <span className="block text-xs text-[#b25e00]">{t('{n} on another shift', { n: r.wrongShift })}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {formatDuration(r.minutes)}
                          {r.noClockOut > 0 && <span className="block text-xs text-[#b25e00]">{t('{n} without clock-out', { n: r.noClockOut })}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">{r.overtime >= 1 ? formatDuration(r.overtime) : '—'}</td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {r.late}
                          {r.lateMinutes >= 1 && <span className="text-xs text-muted"> · {Math.round(r.lateMinutes)} min</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {r.early}
                          {r.earlyMinutes >= 1 && <span className="text-xs text-muted"> · {Math.round(r.earlyMinutes)} min</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right">{r.mc}</td>
                        <td className="px-2 py-2.5 text-right">
                          {r.leave}
                          {r.leave > 0 && (
                            <span className="block text-xs text-muted">
                              {LEAVE_KINDS.filter((k) => r.leaveBy[k] > 0 && (k !== 'other' || r.leaveBy.other !== r.leave)).map((k) => `${r.leaveBy[k]} ${t(SHORT_LEAVE[k])}`).join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-5 pl-2 text-right font-semibold">{r.absent}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-sm text-muted">
            {t('Hours are from clock-in to clock-out, less the unpaid break on a day of more than five hours. Overtime is the time worked after the shift’s end time. A day without a clock-out counts as a day worked, but adds no hours until the clock-out is filled in.')}
          </p>
        </>
      )}
    </div>
  )
}
