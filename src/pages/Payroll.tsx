import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Button, Card, EmptyState, ErrorNote, PageLoader, Stat, inputClass } from '../components/ui'
import { fetchClockOuts, fetchSessionAttendance } from '../data/attendance'
import { LEAVE_LABEL, fetchLeaveTypes } from '../data/evidence'
import { fetchPlans } from '../data/plans'
import { fetchRoster } from '../data/roster'
import { useProfile } from '../hooks/useAuth'
import { useEditableClasses } from '../hooks/useClasses'
import { useLive } from '../hooks/useLive'
import { useMySessions } from '../hooks/useSessions'
import { subscribeOrgSessions } from '../data/sessions'
import type { Session } from '../lib/types'
import { downloadCsv } from '../lib/csv'
import { addDays, formatClock, formatDate, formatDuration, isoDate, parseDate, weekStart } from '../lib/format'
import { t } from '../lib/i18n'
import { type DayEntry, type PayrollRow, buildPayroll, hours } from '../lib/payroll'

const LEAVE_KINDS = ['annual', 'emergency', 'unpaid', 'other'] as const
const SHORT_LEAVE = { annual: 'annual', emergency: 'emergency', unpaid: 'unpaid', other: 'other' }

/** The letter each kind of day shows in the month grid, so it reads without colour too. */
const MARK: Record<DayEntry['mark'], { letter: string; tone: string; label: string }> = {
  present: { letter: '✓', tone: 'text-emerald-700', label: 'Present' },
  late: { letter: 'L', tone: 'text-[#b25e00] font-semibold', label: 'Late' },
  half: { letter: '½', tone: 'text-ink', label: 'Half day' },
  leave: { letter: 'LV', tone: 'text-muted', label: 'Leave' },
  mc: { letter: 'MC', tone: 'text-muted', label: 'MC' },
  absent: { letter: 'A', tone: 'text-red-700 font-semibold', label: 'Absent' },
}

const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/** Who needs a word from HR this period, and why. */
function concerns(r: PayrollRow): string[] {
  const out: string[] = []
  if (r.absent) out.push(t(r.absent === 1 ? 'absent 1 day' : 'absent {n} days', { n: r.absent }))
  if (r.late >= 3) out.push(t('late {n} times', { n: r.late }))
  if (r.early >= 3) out.push(t('left early {n} times', { n: r.early }))
  if (r.noClockOut) out.push(t('{n} without clock-out', { n: r.noClockOut }))
  if (r.wrongShift) out.push(t('{n} on another shift', { n: r.wrongShift }))
  return out
}

const csvCell = (v: string | number) => {
  const s = String(v)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** A month of clocking for everyone, by department: the sheet that goes to payroll. */
export function Payroll() {
  const profile = useProfile()
  const mySessions = useMySessions()
  const classes = useEditableClasses()
  const [month, setMonth] = useState(isoDate().slice(0, 7))
  // Payroll often runs on a cut-off (say the 26th to the 25th), so any dates can be picked.
  const [custom, setCustom] = useState(false)
  const [fromDate, setFromDate] = useState(`${isoDate().slice(0, 7)}-01`)
  const [toDate, setToDate] = useState(isoDate())
  const from = custom ? fromDate : `${month}-01`
  const to = custom ? (toDate < fromDate ? fromDate : toDate) : lastDay(month)
  const [view, setView] = useState<'summary' | 'grid'>('summary')
  const [person, setPerson] = useState<string | null>(null)
  const [department, setDepartment] = useState('')
  const [office, setOffice] = useState('')
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
        setRows(
          buildPayroll(
            held,
            new Map(records),
            new Map(outs),
            new Map(rosters),
            plans.flat(),
            new Map([...held.filter((s) => s.rosterId).map((s) => [s.rosterId!, s.venue || ''] as const), ...(classes.data ?? []).map((c) => [c.id, c.venue || ''] as const)]),
            Date.now(),
            new Map(leave),
            // Each list's working days, and the days it was closed (public holidays), for rest-day and holiday hours.
            new Map((classes.data ?? []).map((c) => [c.id, { days: c.days, off: new Set(Object.keys(c.cancelled ?? {}).map((k) => k.slice(0, 10))) }] as const)),
          ),
        ),
      () => !stale && setFailed(true),
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, from, to, profile.id, classes.data])

  if (source.loading || classes.loading) return <PageLoader />

  const departments = [...new Set((rows ?? []).map((r) => r.department).filter(Boolean))]
  const offices = [...new Set((rows ?? []).map((r) => r.office).filter(Boolean))]
  const shown = (rows ?? []).filter((r) => (!department || r.department === department) && (!office || r.office === office))
  const sum = (list: PayrollRow[], field: 'minutes' | 'overtime' | 'late' | 'absent' | 'days' | 'restMinutes' | 'holidayMinutes') => list.reduce((a, r) => a + r[field], 0)
  const due = sum(shown, 'days') + sum(shown, 'absent')
  const rate = due ? Math.round((sum(shown, 'days') / due) * 1000) / 10 : null
  const flagged = shown.map((r) => ({ r, why: concerns(r) })).filter((x) => x.why.length)
  const periodName = custom ? `${formatDate(from)} – ${formatDate(to)}` : parseDate(from).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const selected = shown.find((r) => r.key === person) ?? (rows ?? []).find((r) => r.key === person)
  // The grid shows every day of the period up to today.
  const dates: string[] = []
  for (let d = from; d <= to && d <= isoDate() && dates.length < 62; d = addDays(d, 1)) dates.push(d)
  // Grouped by office first when there is more than one, then by department.
  const label = (r: PayrollRow) => [offices.length > 1 ? r.office : '', r.department].filter(Boolean).join(' · ')
  const groups = [...new Set(shown.map(label))].map((name) => ({ name, list: shown.filter((r) => label(r) === name) }))

  const exportCsv = () =>
    downloadCsv(
      `payroll-${custom ? `${from}-to-${to}` : month}${department ? `-${department.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}-excel.csv`,
      [
        ['Office', 'Department', 'Student ID', 'Student Name', 'Days worked', 'Attendance %', 'Hours', 'Overtime hours', 'Rest day hours', 'Public holiday hours', 'Late', 'Late minutes', 'Left early', 'Early minutes', 'Allowed to leave early', 'Half days', 'MC', 'Excused', ...LEAVE_KINDS.map((k) => LEAVE_LABEL[k]), 'Absent', 'No clock-out', 'Wrong shift'].map((h) => t(h)),
        ...shown.map((r) => [r.office, r.department, r.staffId, r.name, r.days, r.rate ?? '', hours(r.minutes), hours(r.overtime), hours(r.restMinutes), hours(r.holidayMinutes), r.late, Math.round(r.lateMinutes), r.early, Math.round(r.earlyMinutes), r.earlyApproved, r.halfDays, r.mc, r.leave, ...LEAVE_KINDS.map((k) => r.leaveBy[k]), r.absent, r.noClockOut, r.wrongShift]),
      ]
        .map((line) => line.map(csvCell).join(','))
        .join('\r\n') + '\r\n',
      true,
    )

  if (selected) return <Timesheet row={selected} period={periodName} onBack={() => setPerson(null)} />

  const nameButton = (r: PayrollRow) => (
    <button type="button" onClick={() => setPerson(r.key)} className="text-left font-medium text-accent hover:underline print:text-ink print:no-underline">
      {r.name}
    </button>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Monthly report')}</h1>
          <p className="text-sm text-muted">
            <span className="hidden print:inline">{periodName} · </span>
            {t('Days, hours, overtime and lateness for each person. Ready for payroll.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" disabled={shown.length === 0} onClick={() => window.print()}>{t('Print')}</Button>
          <Button disabled={shown.length === 0} onClick={exportCsv}>{t('Export for Excel')}</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {custom ? (
          <>
            <label className="block text-xs font-medium text-muted">
              {t('From')}
              <input type="date" value={fromDate} max={isoDate()} onChange={(e) => e.target.value && setFromDate(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-muted">
              {t('To')}
              <input type="date" value={toDate} min={fromDate} max={isoDate()} onChange={(e) => e.target.value && setToDate(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          </>
        ) : (
          <label className="block text-xs font-medium text-muted">
            {t('Month')}
            <input type="month" value={month} max={isoDate().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        )}
        <button type="button" onClick={() => setCustom(!custom)} className="pb-2.5 text-sm font-medium text-accent hover:underline">
          {custom ? t('Whole month') : t('Pick dates (pay cut-off)')}
        </button>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label={t('People')} value={shown.length} />
            <Stat label={t('Attendance')} value={rate === null ? '—' : `${rate}%`} />
            <Stat label={t('Hours')} value={formatDuration(sum(shown, 'minutes'))} />
            <Stat label={t('Overtime')} value={formatDuration(sum(shown, 'overtime') + sum(shown, 'restMinutes') + sum(shown, 'holidayMinutes'))} />
            <Stat label={t('Late')} value={sum(shown, 'late')} />
          </div>

          {flagged.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold">{t('Needs attention')} <span className="font-normal text-muted">· {flagged.length}</span></h2>
              <p className="text-sm text-muted">{t('Absent without leave, late or leaving early three times or more, or a day with no clock-out to fix before payroll.')}</p>
              <ul className="mt-3 divide-y divide-line text-sm">
                {flagged.map(({ r, why }) => (
                  <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                    <span>
                      {nameButton(r)}
                      <span className="text-muted"> · {[r.office, r.department].filter(Boolean).join(' · ') || r.staffId}</span>
                    </span>
                    <span className="text-[#b25e00]">{why.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-sm print:hidden" role="tablist">
            {(['summary', 'grid'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 font-medium ${view === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}>
                {t(v === 'summary' ? 'Totals' : 'Day by day')}
              </button>
            ))}
          </div>

          {view === 'grid' ? (
            <MonthGrid groups={groups} dates={dates} nameButton={nameButton} />
          ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-muted">
                <tr>
                  <th className="py-2.5 pr-2 pl-5 font-medium">{t('Student ID')}</th>
                  <th className="px-2 py-2.5 font-medium">{t('Name')}</th>
                  {['Days worked', 'Attendance', 'Hours', 'Overtime', 'Late', 'Left early', 'MC', 'Excused', 'Absent'].map((h) => (
                    <th key={h} className="px-2 py-2.5 text-right font-medium last:pr-5">{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {groups.map((g) => (
                  <Fragment key={g.name}>
                    {(departments.length > 0 || offices.length > 1 || g.name) && (
                      <tr className="bg-slate-50/70 text-xs font-semibold">
                        <td colSpan={4} className="py-2 pr-2 pl-5">{g.name || t('No department')} <span className="font-normal text-muted">· {g.list.length}</span></td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">{formatDuration(sum(g.list, 'minutes'))}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">{formatDuration(sum(g.list, 'overtime') + sum(g.list, 'restMinutes') + sum(g.list, 'holidayMinutes'))}</td>
                        <td className="px-2 py-2 text-right">{sum(g.list, 'late')}</td>
                        <td colSpan={3} />
                        <td className="py-2 pr-5 pl-2 text-right">{sum(g.list, 'absent')}</td>
                      </tr>
                    )}
                    {g.list.map((r) => (
                      <tr key={r.key}>
                        <td className="py-2.5 pr-2 pl-5 font-medium whitespace-nowrap">{r.staffId}</td>
                        <td className="px-2 py-2.5 break-words">{nameButton(r)}</td>
                        <td className="px-2 py-2.5 text-right">
                          {r.days}
                          {r.wrongShift > 0 && <span className="block text-xs text-[#b25e00]">{t('{n} on another shift', { n: r.wrongShift })}</span>}
                        </td>
                        <td className={`px-2 py-2.5 text-right ${r.rate !== null && r.rate < 90 ? 'font-semibold text-[#b25e00]' : ''}`}>{r.rate === null ? '—' : `${r.rate}%`}</td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {formatDuration(r.minutes)}
                          {r.noClockOut > 0 && <span className="block text-xs text-[#b25e00]">{t('{n} without clock-out', { n: r.noClockOut })}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {r.overtime >= 1 ? formatDuration(r.overtime) : '—'}
                          {r.restMinutes >= 1 && <span className="block text-xs text-muted">{t('rest day {h}', { h: formatDuration(r.restMinutes) })}</span>}
                          {r.holidayMinutes >= 1 && <span className="block text-xs text-muted">{t('public holiday {h}', { h: formatDuration(r.holidayMinutes) })}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {r.late}
                          {r.lateMinutes >= 1 && <span className="text-xs text-muted"> · {Math.round(r.lateMinutes)} min</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {r.early}
                          {r.earlyMinutes >= 1 && <span className="text-xs text-muted"> · {Math.round(r.earlyMinutes)} min</span>}
                          {r.earlyApproved > 0 && <span className="block text-xs text-muted">{t('+{n} allowed', { n: r.earlyApproved })}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right">{r.mc}</td>
                        <td className="px-2 py-2.5 text-right">
                          {r.leave}
                          {r.halfDays > 0 && <span className="block text-xs text-muted">{t(r.halfDays === 1 ? '+1 half day' : '+{n} half days', { n: r.halfDays })}</span>}
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
          )}
          <div className="space-y-2 text-sm text-muted">
            <p>{t('Hours are from clock-in to clock-out, less the unpaid break on a day of more than five hours. Overtime is the time worked after the shift’s end time. A day without a clock-out counts as a day worked, but adds no hours until the clock-out is filled in.')}</p>
            <p>{t('Attendance is the days worked out of the days each person was due; MC and leave are left out. Work on a rest day or a public holiday is shown apart. Under the Employment Act 1955 overtime is paid at least 1.5 times the hourly rate on a normal day, 2 times on a rest day and 3 times on a public holiday. Click a name for that person’s timesheet.')}</p>
          </div>
        </>
      )}
    </div>
  )
}

type Group = { name: string; list: PayrollRow[] }

/** People down the side, days across the top: the classic HR attendance sheet. */
function MonthGrid({ groups, dates, nameButton }: { groups: Group[]; dates: string[]; nameButton: (r: PayrollRow) => ReactNode }) {
  const cell = (r: PayrollRow, date: string) => {
    const marks = r.entries.filter((e) => e.date === date)
    if (marks.length === 0) return <span className="text-slate-300">·</span>
    return marks.map((e, i) => (
      <span key={i} className={MARK[e.mark].tone} title={`${e.sessionName}: ${t(MARK[e.mark].label)}`}>
        {t(MARK[e.mark].letter)}
      </span>
    ))
  }
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="min-w-full text-center text-xs tabular">
          <thead className="bg-slate-50 text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 py-2 pr-2 pl-4 text-left font-medium">{t('Name')}</th>
              {dates.map((d) => {
                const day = parseDate(d)
                const weekend = day.getDay() === 0 || day.getDay() === 6
                return (
                  <th key={d} className={`min-w-7 px-1 py-2 font-medium ${weekend ? 'bg-slate-100' : ''}`}>
                    {day.getDate()}
                    <span className="block text-[10px] font-normal">{day.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {groups.map((g) => (
              <Fragment key={g.name}>
                {g.name && (
                  <tr className="bg-slate-50/70 font-semibold">
                    <td className="sticky left-0 bg-slate-50 py-1.5 pr-2 pl-4 text-left" colSpan={1}>{g.name}</td>
                    <td colSpan={dates.length} />
                  </tr>
                )}
                {g.list.map((r) => (
                  <tr key={r.key}>
                    <td className="sticky left-0 z-10 max-w-44 truncate bg-white py-1.5 pr-2 pl-4 text-left text-sm">{nameButton(r)}</td>
                    {dates.map((d) => (
                      <td key={d} className={`px-1 py-1.5 ${[0, 6].includes(parseDate(d).getDay()) ? 'bg-slate-50' : ''}`}>{cell(r, d)}</td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {Object.values(MARK).map((m) => (
          <span key={m.label}>
            <span className={m.tone}>{t(m.letter)}</span> {t(m.label)}
          </span>
        ))}
        <span>· {t('No shift that day')}</span>
      </p>
    </>
  )
}

/** One person's days in full: what an HR officer checks before payroll, or hands to the person. */
function Timesheet({ row, period, onBack }: { row: PayrollRow; period: string; onBack: () => void }) {
  const status = (e: DayEntry) => {
    if (e.mark === 'leave') return `${t('Leave')}${e.leaveType && e.leaveType !== 'other' ? ` (${t(SHORT_LEAVE[e.leaveType])})` : ''}`
    const bits = [t(MARK[e.mark].label)]
    if (e.halfDay) bits[0] = t(e.halfDay === 'am' ? 'Half day (morning off)' : 'Half day (afternoon off)')
    if (e.late >= 1) {
      if (e.mark === 'late') bits.shift()
      bits.unshift(t('Late by {n} min', { n: Math.round(e.late) }))
    }
    if (e.early >= 1) bits.push(e.earlyOk ? t('left early, allowed') : t('left early {n} min', { n: Math.round(e.early) }))
    if (e.noClockOut) bits.push(t('no clock-out'))
    if (e.dayType === 'rest') bits.push(t('rest day'))
    if (e.dayType === 'holiday') bits.push(t('public holiday'))
    return bits.join(' · ')
  }
  const time = (ms?: number) => (ms ? formatClock(new Date(ms)) : '—')
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-sm font-medium text-accent hover:underline print:hidden">← {t('Back to report')}</button>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{row.name}</h1>
          <p className="text-sm text-muted">{[t('Timesheet'), period, row.staffId, row.office, row.department].filter(Boolean).join(' · ')}</p>
        </div>
        <Button variant="secondary" onClick={() => window.print()} className="print:hidden">{t('Print')}</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t('Days worked')} value={row.days} />
        <Stat label={t('Attendance')} value={row.rate === null ? '—' : `${row.rate}%`} />
        <Stat label={t('Hours')} value={formatDuration(row.minutes)} />
        <Stat label={t('Overtime')} value={formatDuration(row.overtime + row.restMinutes + row.holidayMinutes)} />
        <Stat label={t('Absent')} value={row.absent} />
      </div>
      {row.entries.length === 0 ? (
        <EmptyState title={t('Nothing recorded this month')} text={t('Once people clock in, their days and hours appear here.')} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-muted">
              <tr>
                {['Date', 'Shift', 'In', 'Out', 'Hours', 'Status'].map((h) => (
                  <th key={h} className="px-2 py-2.5 font-medium first:pl-5 last:pr-5">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {row.entries.map((e, i) => (
                <tr key={i}>
                  <td className="py-2.5 pr-2 pl-5 whitespace-nowrap">{parseDate(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="px-2 py-2.5">{e.sessionName}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap">{time(e.clockIn)}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap">{time(e.clockOut)}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap">{e.minutes ? formatDuration(e.minutes) : '—'}</td>
                  <td className={`py-2.5 pr-5 pl-2 ${e.mark === 'absent' || e.mark === 'late' || e.noClockOut ? 'text-[#b25e00]' : ''}`}>{status(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="hidden gap-16 pt-12 text-sm print:flex">
        <span className="border-t border-ink pt-1">{t('Employee signature')}</span>
        <span className="border-t border-ink pt-1">{t('Checked by (HR)')}</span>
      </div>
    </div>
  )
}
