import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AttendanceTrend, LevelTag } from '../components/charts'
import { LINE_COLORS, LineChart, type Series } from '../components/LineChart'
import { Card, EmptyState, ErrorNote, PageLoader, Spinner } from '../components/ui'
import { getOrganisation } from '../data/account'
import { useProfile } from '../hooks/useAuth'
import { useEditableClasses, useMyClasses } from '../hooks/useClasses'
import { useClassReport } from '../hooks/useClassReport'
import { usePayrollRows } from '../hooks/usePayrollRows'
import { addDays, formatDuration, formatPercent, isoDate, weekStart } from '../lib/format'
import { locale, t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { type ClassReport, STREAK_FLAG } from '../lib/report'
import type { PayrollRow } from '../lib/payroll'
import type { Organisation, Session, WeeklyClass } from '../lib/types'

/**
 * Everything at a glance, on one page: for lecturers and trainers the semester across all their
 * classes; for a workplace the month across all its staff. The numbers are the same ones each
 * class's report and the Pay page work out, added up.
 */
export function Overview() {
  return has('clock') ? <WorkOverview /> : <ClassOverview />
}

/* ---------- shared pieces ---------- */

function Tile({ label, value, note, tone = 'plain' }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'plain' | 'good' | 'warn' | 'bad' }) {
  const ring = { plain: '', good: 'ring-1 ring-emerald-200', warn: 'ring-1 ring-amber-200', bad: 'ring-1 ring-rose-200' }[tone]
  return (
    <div className={`rounded-xl bg-white px-4 py-4 shadow-card ${ring}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  )
}

/** "▲ 4.2 points" against the period before, coloured by whether it is good news. */
function Change({ now, before, higherIsBetter = true, unit = 'pts' }: { now: number | null; before: number | null; higherIsBetter?: boolean; unit?: 'pts' | 'n' }) {
  if (now === null || before === null) return null
  const d = Math.round((now - before) * 10) / 10
  if (d === 0) return <span className="text-muted">{t('Same as before')}</span>
  const good = d > 0 === higherIsBetter
  const size = unit === 'pts' ? t('{n} points', { n: Math.abs(d) }) : String(Math.abs(d))
  return (
    <span className={good ? 'font-medium text-emerald-700' : 'font-medium text-rose-700'}>
      {d > 0 ? '▲' : '▼'} {size}
    </span>
  )
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/* ---------- lecturers and trainers ---------- */

/** Loads one class's report and hands it up; draws nothing. */
function ClassProbe({ cls, onReport }: { cls: WeeklyClass; onReport: (id: string, r: ClassReport | 'failed') => void }) {
  const { report, failed } = useClassReport(cls)
  useEffect(() => {
    if (report) onReport(cls.id, report)
    else if (failed) onReport(cls.id, 'failed')
  }, [report, failed, cls.id, onReport])
  return null
}

function ClassOverview() {
  const classes = useMyClasses()
  const today = isoDate()
  const current = useMemo(() => (classes.data ?? []).filter((c) => !c.endDate || c.endDate >= today), [classes.data, today])
  const [reports, setReports] = useState<Record<string, ClassReport | 'failed'>>({})
  const onReport = useCallback((id: string, r: ClassReport | 'failed') => setReports((all) => (all[id] === r ? all : { ...all, [id]: r })), [])

  if (classes.loading) return <PageLoader />
  if (classes.error) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>

  const probes = current.map((c) => <ClassProbe key={c.id} cls={c} onReport={onReport} />)
  if (current.length === 0) {
    return (
      <div className="space-y-6">
        <Heading text={t('This semester, across all your classes')} />
        <EmptyState
          title={t('No classes this semester yet')}
          text={t('Add your weekly classes with their semester dates, and this page sums them all up.')}
          action={<Link to="/app/timetable" className="font-semibold text-accent">{t('Open the timetable')} ›</Link>}
        />
      </div>
    )
  }

  const ready = current.filter((c) => reports[c.id] && reports[c.id] !== 'failed').map((c) => ({ cls: c, report: reports[c.id] as ClassReport }))
  const loading = current.some((c) => !reports[c.id])
  const failed = current.filter((c) => reports[c.id] === 'failed')

  // Every session's rate, across classes; weeks, for the trend and the change.
  const points = ready.flatMap((x) => x.report.trend.filter((p) => p.rate !== null).map((p) => ({ date: p.session.date, rate: p.rate! })))
  const average = mean(points.map((p) => p.rate))
  const fourWeeks = addDays(today, -28)
  const eightWeeks = addDays(today, -56)
  const recent = mean(points.filter((p) => p.date > fourWeeks).map((p) => p.rate))
  const before = mean(points.filter((p) => p.date > eightWeeks && p.date <= fourWeeks).map((p) => p.rate))
  const byWeek = new Map<string, number[]>()
  for (const p of points) byWeek.set(weekStart(p.date), [...(byWeek.get(weekStart(p.date)) ?? []), p.rate])
  const weekly = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, rates]) => ({ session: { id: week, date: week } as Session, present: 0, rate: mean(rates) }))

  // One line per class, week by week, so a class that is slipping stands out.
  const perClass: Series[] = ready
    .filter((x) => x.report.trend.some((p) => p.rate !== null))
    .slice(0, LINE_COLORS.length)
    .map((x, i) => {
      const weeks = new Map<string, number[]>()
      for (const p of x.report.trend) if (p.rate !== null) weeks.set(weekStart(p.session.date), [...(weeks.get(weekStart(p.session.date)) ?? []), p.rate])
      return { label: x.cls.name, color: LINE_COLORS[i], points: new Map([...weeks].map(([w, rates]) => [w, Math.round((mean(rates) ?? 0) * 10) / 10])) }
    })
  const held = ready.reduce((n, x) => n + x.report.held.length, 0)
  const planned = ready.reduce((n, x) => n + Math.max(x.report.planned, x.report.held.length), 0)
  const people = ready.flatMap((x) => x.report.rows.filter((r) => !r.to || r.to >= today).map((row) => ({ row, cls: x.cls })))
  const barring = people.filter((p) => p.row.level === 'barring')
  const warning = people.filter((p) => p.row.level === 'warning')
  const streaks = people.filter((p) => p.row.streak >= STREAK_FLAG && p.row.level === 'ok')
  const attention = [...barring, ...warning, ...streaks].sort(
    (a, b) => rank(a.row.level) - rank(b.row.level) || b.row.absent - a.row.absent || b.row.streak - a.row.streak,
  )
  const ranked = [...ready].sort((a, b) => (a.report.average ?? 101) - (b.report.average ?? 101))
  const atRisk = new Set([...barring, ...warning].map((p) => p.row.key)).size

  return (
    <div className="space-y-6">
      {probes}
      <Heading text={t('This semester, across all your classes')} busy={loading} />
      {failed.length > 0 && <ErrorNote>{t('Some classes could not be loaded. Check your connection and reload.')}</ErrorNote>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={t('Average attendance')}
          value={average === null ? '—' : formatPercent(average)}
          note={<>{t('Last 4 weeks')}: {recent === null ? '—' : formatPercent(recent)} <Change now={recent} before={before} /></>}
          tone={average === null ? 'plain' : average >= 80 ? 'good' : average >= 70 ? 'warn' : 'bad'}
        />
        <Tile label={t('Classes held')} value={<>{held}<span className="text-base font-normal text-muted"> / {planned}</span></>} note={t('{n} classes this semester', { n: current.length })} />
        <Tile
          label={t('Students at risk')}
          value={atRisk}
          note={t('{b} due barring · {w} due a warning', { b: barring.length, w: warning.length })}
          tone={barring.length ? 'bad' : warning.length ? 'warn' : 'good'}
        />
        <Tile label={t('Missing classes in a row')} value={streaks.length} note={t('{n} or more in a row, not yet at risk', { n: STREAK_FLAG })} tone={streaks.length ? 'warn' : 'plain'} />
      </div>

      {weekly.length > 1 && (
        <Card className="p-5">
          <h2 className="font-semibold">{t('Attendance by week')}</h2>
          <p className="text-sm text-muted">{t('All your classes together, week by week.')}</p>
          <div className="mt-4">
            <AttendanceTrend trend={weekly} />
          </div>
        </Card>
      )}

      {perClass.length > 1 && (
        <Card className="p-5">
          <h2 className="font-semibold">{t('Each class, week by week')}</h2>
          <p className="text-sm text-muted">{t('One line for each class. The dashed line is the 80% rule.')}</p>
          <div className="mt-4">
            <LineChart series={perClass} percent goal={80} format={(v) => formatPercent(v)} />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
          <h2 className="font-semibold">{t('Needs attention')}</h2>
          <span className="text-sm text-muted">{attention.length}</span>
        </div>
        {attention.length === 0 ? (
          <p className="px-5 pt-2 pb-5 text-sm text-muted">{loading ? t('Adding up your classes…') : t('Nobody needs attention right now.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {attention.slice(0, 12).map(({ row, cls }) => (
              <li key={`${cls.id}-${row.key}`}>
                <Link to={`/app/timetable/${cls.id}/report`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.studentName}</span>
                    <span className="block truncate text-sm text-muted">
                      {row.studentId} · {cls.name}
                    </span>
                  </span>
                  <span className="tabular text-sm text-muted">
                    {row.streak >= STREAK_FLAG && row.level === 'ok'
                      ? t('{n} in a row', { n: row.streak })
                      : t(row.absent === 1 ? '1 absence' : '{n} absences', { n: row.absent })}
                    {row.rate !== null && ` · ${formatPercent(row.rate)}`}
                  </span>
                  {row.level !== 'ok' && <LevelTag level={row.level} />}
                </Link>
              </li>
            ))}
            {attention.length > 12 && <li className="px-5 py-3 text-sm text-muted">{t('And {n} more, in each class report.', { n: attention.length - 12 })}</li>}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-5 pt-5 font-semibold">{t('Classes, lowest attendance first')}</h2>
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {ranked.map(({ cls, report }) => {
            const risk = report.rows.filter((r) => r.level !== 'ok').length
            return (
              <li key={cls.id}>
                <Link to={`/app/timetable/${cls.id}/report`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_10rem_6rem]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{cls.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {t('{a} of {b} classes held', { a: report.held.length, b: Math.max(report.planned, report.held.length) })}
                      {risk ? ` · ${t('{n} at risk', { n: risk })}` : ''}
                    </span>
                  </span>
                  <span className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-slate-100 sm:order-none sm:col-span-1">
                    <span
                      className={`block h-full rounded-full ${report.average === null ? '' : report.average >= 80 ? 'bg-emerald-500' : report.average >= 70 ? 'bg-amber-400' : 'bg-rose-500'}`}
                      style={{ width: `${Math.max(0, Math.min(100, report.average ?? 0))}%` }}
                    />
                  </span>
                  <span className="tabular text-right font-semibold">{report.held.length ? formatPercent(report.average) : '—'}</span>
                </Link>
              </li>
            )
          })}
          {loading && (
            <li className="px-5 py-4">
              <Spinner small />
            </li>
          )}
        </ul>
      </Card>
    </div>
  )
}

const rank = (level: string) => (level === 'barring' ? 0 : level === 'warning' ? 1 : 2)

function Heading({ text, busy = false }: { text: string; busy?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-sm text-muted">{text}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Overview')}</h1>
      </div>
      {busy && <Spinner small />}
    </div>
  )
}

/* ---------- workplaces ---------- */

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`

function WorkOverview() {
  const profile = useProfile()
  const classes = useEditableClasses()
  const [org, setOrg] = useState<Organisation | null>(null)
  useEffect(() => {
    getOrganisation(profile.organisationId).then(setOrg, () => {})
  }, [profile.organisationId])
  const today = isoDate()
  const from = monthStart(today)
  // The month before, up to the same day, to compare like with like.
  const prevFrom = monthStart(addDays(from, -1))
  const prevTo = addDays(prevFrom, Math.max(0, Number(today.slice(8, 10)) - 1))
  const now = usePayrollRows(from, today, org, classes)
  const prev = usePayrollRows(prevFrom, prevTo, org, classes)

  if (now.source.loading || classes.loading) return <PageLoader />
  if (now.failed) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>

  const sum = (rows: PayrollRow[] | null, f: (r: PayrollRow) => number) => (rows ?? []).reduce((n, r) => n + f(r), 0)
  const rate = (rows: PayrollRow[] | null) => {
    const worked = sum(rows, (r) => r.days - r.extraDays)
    const due = worked + sum(rows, (r) => r.absent)
    return rows && due ? Math.round((worked / due) * 1000) / 10 : null
  }
  const rows = now.rows
  const monthName = new Date(`${from}T00:00:00`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
  if (rows === null) {
    return (
      <div className="space-y-6">
        <WorkHeading month={monthName} />
        <Card className="p-6"><Spinner /></Card>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <WorkHeading month={monthName} />
        <EmptyState title={t('Nothing recorded this month yet')} text={t('Once staff clock in, this page sums up the month: attendance, lateness, overtime and leave.')} />
      </div>
    )
  }
  const overtime = sum(rows, (r) => r.overtime + r.restMinutes + r.holidayMinutes)
  const prevOvertime = prev.rows ? sum(prev.rows, (r) => r.overtime + r.restMinutes + r.holidayMinutes) : null
  const late = sum(rows, (r) => r.late)
  const off = sum(rows, (r) => r.mc + r.leave)
  const top = (f: (r: PayrollRow) => number) => [...rows].filter((r) => f(r) > 0).sort((a, b) => f(b) - f(a)).slice(0, 5)
  // Day by day: who was due and who came (leave, MC, rest days and holidays left out), and who was late.
  const days = new Map<string, { due: number; came: number; late: number }>()
  for (const r of rows) {
    for (const e of r.entries) {
      if (e.mark === 'leave' || e.mark === 'mc' || e.dayType !== 'normal') continue
      const d = days.get(e.date) ?? { due: 0, came: 0, late: 0 }
      d.due += 1
      if (e.mark !== 'absent') d.came += 1
      if (e.mark === 'late' || e.late > 0) d.late += 1
      days.set(e.date, d)
    }
  }
  const daily = [...days].filter(([, d]) => d.due > 0)
  const dailyRate: Series[] = [{ label: t('Attendance'), color: LINE_COLORS[0], points: new Map(daily.map(([date, d]) => [date, Math.round((d.came / d.due) * 1000) / 10])) }]
  const dailyLate: Series[] = [{ label: t('Late arrivals'), color: 'var(--color-amber-500)', points: new Map(daily.map(([date, d]) => [date, d.late])) }]
  const offices = [...new Set(rows.map((r) => r.office).filter(Boolean))]
    .map((office) => ({ office, rate: rate(rows.filter((r) => r.office === office)), people: rows.filter((r) => r.office === office).length }))
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101))

  return (
    <div className="space-y-6">
      <WorkHeading month={monthName} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('Attendance')} value={rate(rows) === null ? '—' : formatPercent(rate(rows))} note={<>{t('Same days last month')}: {rate(prev.rows) === null ? '—' : formatPercent(rate(prev.rows))} <Change now={rate(rows)} before={rate(prev.rows)} /></>} tone={(rate(rows) ?? 100) >= 95 ? 'good' : (rate(rows) ?? 100) >= 85 ? 'warn' : 'bad'} />
        <Tile label={t('Late arrivals')} value={late} note={<>{t('Same days last month')}: {prev.rows ? sum(prev.rows, (r) => r.late) : '—'} <Change now={late} before={prev.rows ? sum(prev.rows, (r) => r.late) : null} higherIsBetter={false} unit="n" /></>} tone={late ? 'warn' : 'good'} />
        <Tile label={t('Overtime')} value={formatDuration(overtime)} note={prevOvertime === null ? undefined : <>{t('Same days last month')}: {formatDuration(prevOvertime)}</>} />
        <Tile label={t('MC and leave')} value={t(off === 1 ? '1 day' : '{n} days', { n: off })} note={t('{n} days absent without leave', { n: sum(rows, (r) => r.absent) })} tone={sum(rows, (r) => r.absent) ? 'warn' : 'plain'} />
      </div>

      {daily.length > 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-semibold">{t('Attendance day by day')}</h2>
            <p className="text-sm text-muted">{t('Of the people due at work each day, how many came.')}</p>
            <div className="mt-4">
              <LineChart series={dailyRate} percent format={(v) => formatPercent(v)} height={200} />
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">{t('Late arrivals day by day')}</h2>
            <p className="text-sm text-muted">{t('How many people clocked in late each day.')}</p>
            <div className="mt-4">
              <LineChart series={dailyLate} format={(v) => String(v)} height={200} />
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <People title={t('Late most often')} rows={top((r) => r.late)} show={(r) => t(r.late === 1 ? 'Late once' : 'Late {n} times', { n: r.late })} empty={t('Nobody was late this month.')} />
        <People title={t('Absent without leave')} rows={top((r) => r.absent)} show={(r) => t(r.absent === 1 ? '1 day' : '{n} days', { n: r.absent })} empty={t('Nobody was absent without leave.')} />
        <People title={t('Most overtime')} rows={top((r) => r.overtime + r.restMinutes + r.holidayMinutes)} show={(r) => formatDuration(r.overtime + r.restMinutes + r.holidayMinutes)} empty={t('No overtime this month.')} />
        {offices.length > 1 && (
          <Card className="overflow-hidden">
            <h2 className="px-5 pt-5 font-semibold">{t('By office, lowest attendance first')}</h2>
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {offices.map((o) => (
                <li key={o.office} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.office}</span>
                    <span className="block text-sm text-muted">{t(o.people === 1 ? '1 person' : '{n} people', { n: o.people })}</span>
                  </span>
                  <span className="tabular font-semibold">{o.rate === null ? '—' : formatPercent(o.rate)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <p className="text-sm text-muted">
        <Link to="/app/reports" className="font-semibold text-accent">{t('See the full month, person by person')} ›</Link>
      </p>
    </div>
  )
}

function WorkHeading({ month }: { month: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{t('{month}, so far', { month })}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Overview')}</h1>
    </div>
  )
}

function People<R extends { key: string; name: string; staffId: string; office: string }>({ title, rows, show, empty }: { title: string; rows: R[]; show: (r: R) => string; empty: string }) {
  return (
    <Card className="overflow-hidden">
      <h2 className="px-5 pt-5 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-5 pt-2 pb-5 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block truncate text-sm text-muted">{[r.staffId, r.office].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="tabular shrink-0 text-sm font-semibold">{show(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
