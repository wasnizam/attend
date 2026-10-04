import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react'
import { PARTS, ReportCharts, buckets, chartData } from '../components/ReportCharts'
import { getOrganisation } from '../data/account'
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
import { type PdfReport, downloadReportPdf } from '../lib/reportPdf'

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

type Period = 'week' | 'month' | 'year' | 'custom'
type GroupBy = 'both' | 'department' | 'office' | 'none'
type Section = 'charts' | 'attention' | 'table' | 'grid'

/** A column of the people table, and what it puts in the Excel file. */
interface Column {
  id: string
  label: string
  csvHead: string[]
  csv: (r: PayrollRow) => (string | number)[]
  cell: (r: PayrollRow) => ReactNode
  /** The same cell as plain text, for the PDF. */
  text: (r: PayrollRow) => string
  total?: (list: PayrollRow[]) => string | number
}

const total = (list: PayrollRow[], f: (r: PayrollRow) => number) => list.reduce((a, r) => a + f(r), 0)
const groupRate = (list: PayrollRow[]) => {
  const worked = total(list, (r) => r.days - r.extraDays)
  const due = worked + total(list, (r) => r.absent)
  return due ? `${Math.round((worked / due) * 1000) / 10}%` : '—'
}
const sub = (text: string, warn = false) => <span className={`block text-xs ${warn ? 'text-[#b25e00]' : 'text-muted'}`}>{text}</span>

const COLUMNS: Column[] = [
  {
    id: 'days', label: 'Days worked', csvHead: ['Days worked'], csv: (r) => [r.days],
    text: (r) => `${r.days}${r.wrongShift ? `\n${t('{n} on another shift', { n: r.wrongShift })}` : ''}`, cell: (r) => <>{r.days}{r.wrongShift > 0 && sub(t('{n} on another shift', { n: r.wrongShift }), true)}</>,
    total: (l) => total(l, (r) => r.days),
  },
  {
    id: 'rate', label: 'Attendance', csvHead: ['Attendance %'], csv: (r) => [r.rate ?? ''],
    text: (r) => (r.rate === null ? '-' : `${r.rate}%`), cell: (r) => <span className={r.rate !== null && r.rate < 90 ? 'font-semibold text-[#b25e00]' : ''}>{r.rate === null ? '—' : `${r.rate}%`}</span>,
    total: groupRate,
  },
  {
    id: 'hours', label: 'Hours', csvHead: ['Hours'], csv: (r) => [hours(r.minutes)],
    text: (r) => [formatDuration(r.minutes), r.noClockOut ? t('{n} without clock-out', { n: r.noClockOut }) : '', r.openDays ? t('{n} still at work', { n: r.openDays }) : ''].filter(Boolean).join('\n'),
    cell: (r) => (
      <>
        {formatDuration(r.minutes)}
        {r.noClockOut > 0 && sub(t('{n} without clock-out', { n: r.noClockOut }), true)}
        {r.openDays > 0 && sub(t('{n} still at work', { n: r.openDays }))}
      </>
    ),
    total: (l) => formatDuration(total(l, (r) => r.minutes)),
  },
  {
    id: 'overtime', label: 'Overtime', csvHead: ['Overtime hours', 'Rest day hours', 'Public holiday hours'], csv: (r) => [hours(r.overtime), hours(r.restMinutes), hours(r.holidayMinutes)],
    text: (r) => [r.overtime >= 1 ? formatDuration(r.overtime) : '-', r.restMinutes >= 1 ? t('rest day {h}', { h: formatDuration(r.restMinutes) }) : '', r.holidayMinutes >= 1 ? t('public holiday {h}', { h: formatDuration(r.holidayMinutes) }) : ''].filter(Boolean).join('\n'), cell: (r) => (
      <>
        {r.overtime >= 1 ? formatDuration(r.overtime) : '—'}
        {r.restMinutes >= 1 && sub(t('rest day {h}', { h: formatDuration(r.restMinutes) }))}
        {r.holidayMinutes >= 1 && sub(t('public holiday {h}', { h: formatDuration(r.holidayMinutes) }))}
      </>
    ),
    total: (l) => {
      const m = total(l, (r) => r.overtime + r.restMinutes + r.holidayMinutes)
      return m >= 1 ? formatDuration(m) : '-'
    },
  },
  {
    id: 'late', label: 'Late', csvHead: ['Late', 'Late minutes'], csv: (r) => [r.late, Math.round(r.lateMinutes)],
    text: (r) => `${r.late}${r.lateMinutes >= 1 ? ` (${Math.round(r.lateMinutes)} min)` : ''}`, cell: (r) => <>{r.late}{r.lateMinutes >= 1 && <span className="text-xs text-muted"> · {Math.round(r.lateMinutes)} min</span>}</>,
    total: (l) => total(l, (r) => r.late),
  },
  {
    id: 'early', label: 'Left early', csvHead: ['Left early', 'Early minutes', 'Allowed to leave early'], csv: (r) => [r.early, Math.round(r.earlyMinutes), r.earlyApproved],
    text: (r) => `${r.early}${r.earlyMinutes >= 1 ? ` (${Math.round(r.earlyMinutes)} min)` : ''}${r.earlyApproved ? `\n${t('+{n} allowed', { n: r.earlyApproved })}` : ''}`, cell: (r) => (
      <>
        {r.early}
        {r.earlyMinutes >= 1 && <span className="text-xs text-muted"> · {Math.round(r.earlyMinutes)} min</span>}
        {r.earlyApproved > 0 && sub(t('+{n} allowed', { n: r.earlyApproved }))}
      </>
    ),
    total: (l) => total(l, (r) => r.early),
  },
  { id: 'mc', label: 'MC', csvHead: ['MC'], csv: (r) => [r.mc], text: (r) => String(r.mc), cell: (r) => r.mc, total: (l) => total(l, (r) => r.mc) },
  {
    id: 'leave', label: 'Excused', csvHead: ['Excused', 'Half days', ...LEAVE_KINDS.map((k) => LEAVE_LABEL[k])], csv: (r) => [r.leave, r.halfDays, ...LEAVE_KINDS.map((k) => r.leaveBy[k])],
    text: (r) => [String(r.leave), r.halfDays ? t(r.halfDays === 1 ? '+1 half day' : '+{n} half days', { n: r.halfDays }) : '', r.leave ? LEAVE_KINDS.filter((k) => r.leaveBy[k] > 0 && (k !== 'other' || r.leaveBy.other !== r.leave)).map((k) => `${r.leaveBy[k]} ${t(SHORT_LEAVE[k])}`).join(', ') : ''].filter(Boolean).join('\n'), cell: (r) => (
      <>
        {r.leave}
        {r.halfDays > 0 && sub(t(r.halfDays === 1 ? '+1 half day' : '+{n} half days', { n: r.halfDays }))}
        {r.leave > 0 && sub(LEAVE_KINDS.filter((k) => r.leaveBy[k] > 0 && (k !== 'other' || r.leaveBy.other !== r.leave)).map((k) => `${r.leaveBy[k]} ${t(SHORT_LEAVE[k])}`).join(', '))}
      </>
    ),
    total: (l) => total(l, (r) => r.leave),
  },
  { id: 'absent', label: 'Absent', csvHead: ['Absent'], csv: (r) => [r.absent], text: (r) => String(r.absent), cell: (r) => <span className="font-semibold">{r.absent}</span>, total: (l) => total(l, (r) => r.absent) },
  { id: 'noClockOut', label: 'No clock-out', csvHead: ['No clock-out', 'Wrong shift'], csv: (r) => [r.noClockOut, r.wrongShift], text: (r) => String(r.noClockOut), cell: (r) => r.noClockOut, total: (l) => total(l, (r) => r.noClockOut) },
]

interface Setup {
  sections: Section[]
  columns: string[]
  groupBy: GroupBy
}
const DEFAULT_SETUP: Setup = { sections: ['charts', 'attention', 'table'], columns: ['days', 'rate', 'hours', 'overtime', 'late', 'early', 'mc', 'leave', 'absent'], groupBy: 'both' }
const SETUP_KEY = 'attend.reportSetup'
const loadSetup = (): Setup => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null')
    if (saved && Array.isArray(saved.sections) && Array.isArray(saved.columns)) return { ...DEFAULT_SETUP, ...saved }
  } catch {
    // Storage blocked or bad data: the standard report.
  }
  return DEFAULT_SETUP
}
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'charts', label: 'Charts' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'table', label: 'Totals for each person' },
  { id: 'grid', label: 'Day-by-day grid' },
]
const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'both', label: 'Office and department' },
  { id: 'department', label: 'Department' },
  { id: 'office', label: 'Office' },
  { id: 'none', label: 'No grouping' },
]

/** Makes the PDF and downloads it; says so if it fails. */
async function savePdf(report: PdfReport, setBusy: (b: boolean) => void) {
  setBusy(true)
  try {
    await downloadReportPdf(report)
  } catch {
    window.alert(t('The PDF could not be made. Try again, or use Export for Excel.'))
  } finally {
    setBusy(false)
  }
}

/** Attendance for everyone over a week, month, year or any dates: charts, exceptions, totals and the payroll sheet. */
export function Payroll() {
  const profile = useProfile()
  const mySessions = useMySessions()
  const classes = useEditableClasses()
  const today = isoDate()
  const [period, setPeriod] = useState<Period>('month')
  const [weekOf, setWeekOf] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [year, setYear] = useState(today.slice(0, 4))
  // Payroll often runs on a cut-off (say the 26th to the 25th), so any dates can be picked.
  const [fromDate, setFromDate] = useState(`${today.slice(0, 7)}-01`)
  const [toDate, setToDate] = useState(today)
  const [from, to] =
    period === 'week' ? [weekStart(weekOf), addDays(weekStart(weekOf), 6)]
    : period === 'year' ? [`${year}-01-01`, `${year}-12-31`]
    : period === 'custom' ? [fromDate, toDate < fromDate ? fromDate : toDate]
    : [`${month}-01`, lastDay(month)]
  const [setup, setSetupState] = useState<Setup>(loadSetup)
  const [customising, setCustomising] = useState(false)
  const setSetup = (next: Setup) => {
    setSetupState(next)
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(next))
    } catch {
      // Not saved; it still applies until the page is left.
    }
  }
  const [person, setPerson] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const [company, setCompany] = useState('')
  useEffect(() => {
    getOrganisation(profile.organisationId).then((o) => setCompany(o?.name ?? ''), () => {})
  }, [profile.organisationId])
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

  const has = (x: Section) => setup.sections.includes(x)
  const columns = COLUMNS.filter((c) => setup.columns.includes(c.id))
  const departments = [...new Set((rows ?? []).map((r) => r.department).filter(Boolean))]
  const offices = [...new Set((rows ?? []).map((r) => r.office).filter(Boolean))]
  const shown = (rows ?? []).filter((r) => (!department || r.department === department) && (!office || r.office === office))
  const days = total(shown, (r) => r.days)
  // The rate compares working days only; extra days on a rest day or holiday are left out.
  const workedDays = days - total(shown, (r) => r.extraDays)
  const due = workedDays + total(shown, (r) => r.absent)
  const rate = due ? Math.round((workedDays / due) * 1000) / 10 : null
  const flagged = shown.map((r) => ({ r, why: concerns(r) })).filter((x) => x.why.length)
  const periodName =
    period === 'week' ? t('Week of {date}', { date: formatDate(from) })
    : period === 'year' ? year
    : period === 'custom' ? `${formatDate(from)} – ${formatDate(to)}`
    : parseDate(from).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  // A period that is not over yet says so, and up to which day.
  const toDate_ = to > today && from <= today ? t('to date, {from} – {to}', { from: formatDate(from), to: formatDate(today) }) : ''
  const periodFull = toDate_ ? `${periodName} (${toDate_})` : periodName
  const title = t(period === 'week' ? 'Weekly attendance report' : period === 'year' ? 'Yearly attendance report' : period === 'month' ? 'Monthly report' : 'Attendance report')
  const selected = shown.find((r) => r.key === person) ?? (rows ?? []).find((r) => r.key === person)
  // The grid shows every day of the period up to today; a year is too wide for it.
  const dates: string[] = []
  for (let d = from; d <= to && d <= today && dates.length < 62; d = addDays(d, 1)) dates.push(d)
  const gridFits = (parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000 < 62
  // "No department" only where that office has departments; an office without any is just its name.
  const officesWithDepartments = new Set(shown.filter((r) => r.department).map((r) => r.office))
  const label = (r: PayrollRow) =>
    setup.groupBy === 'none' ? ''
    : setup.groupBy === 'office' ? r.office
    : setup.groupBy === 'department' ? r.department
    : [offices.length > 1 ? r.office : '', r.department || (officesWithDepartments.has(r.office) ? t('No department') : '')].filter(Boolean).join(' · ')
  const groups = [...new Set(shown.map(label))].map((name) => ({ name, list: shown.filter((r) => label(r) === name) }))
  const fileName = `attendance-${period === 'month' ? month : period === 'year' ? year : `${from}-to-${to}`}${department ? `-${department.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`

  const exportCsv = () =>
    downloadCsv(
      `${fileName}-excel.csv`,
      [
        ['Office', 'Department', 'Student ID', 'Student Name', ...columns.flatMap((c) => c.csvHead)].map((h) => t(h)),
        ...shown.map((r) => [r.office, r.department, r.staffId, r.name, ...columns.flatMap((c) => c.csv(r))]),
      ]
        .map((line) => line.map(csvCell).join(','))
        .join('\r\n') + '\r\n',
      true,
    )

  const pdf = (): PdfReport => {
    const head = [t('Student ID'), t('Name'), ...columns.map((c) => t(c.label))]
    const totals = (list: PayrollRow[], name: string) => [name, '', ...columns.map((c) => String(c.total?.(list) ?? ''))]
    const absent = total(shown, (r) => r.absent)
    const late = total(shown, (r) => r.late)
    const off = total(shown, (r) => r.leave + r.mc)
    const noOut = total(shown, (r) => r.noClockOut)
    const open = total(shown, (r) => r.openDays)
    const timed = total(shown, (r) => r.timedDays)
    const overtime = total(shown, (r) => r.overtime)
    const rest = total(shown, (r) => r.restMinutes)
    const holiday = total(shown, (r) => r.holidayMinutes)
    const { byGroup, late: lateList } = chartData(shown, groups)
    const trend = buckets(shown, from, to < today ? to : today)
    // Plain sentences an HR manager would write at the top of the report.
    const findings = [
      rate === null ? '' : t(rate >= 95 ? 'Attendance was {rate}%, a strong result.' : rate >= 90 ? 'Attendance was {rate}%.' : 'Attendance was {rate}%, below the usual 90% mark.', { rate }),
      absent ? t(absent === 1 ? '1 day absent without leave.' : '{n} days absent without leave.', { n: absent }) : t('Nobody was absent without leave.'),
      late ? t('{n} late arrivals; most often {name} ({k} times).', { n: late, name: lateList[0]?.label ?? '', k: lateList[0]?.value ?? 0 }) : t('Nobody arrived late.'),
      byGroup.length > 1 ? t('Lowest attendance: {group} at {rate}%.', { group: byGroup[0].label, rate: byGroup[0].value }) : '',
      off ? t(off === 1 ? '1 day of leave or MC.' : '{n} days of leave or MC.', { n: off }) : '',
      overtime + rest + holiday >= 1 ? t('Overtime {h}; rest days {r}; public holidays {p}.', { h: formatDuration(overtime), r: formatDuration(rest), p: formatDuration(holiday) }) : '',
      timed < days
        ? open && noOut
          ? t('Hours cover {a} of {b} days worked: {c} without a clock-out (fix before payroll), {d} still at work.', { a: timed, b: days, c: noOut, d: open })
          : noOut
            ? t('Hours cover {a} of {b} days worked: {c} without a clock-out, to fix before payroll.', { a: timed, b: days, c: noOut })
            : t('Hours cover {a} of {b} days worked: {d} still at work.', { a: timed, b: days, d: open })
        : '',
      flagged.length ? t('{n} people need attention (listed below).', { n: flagged.length }) : '',
    ].filter(Boolean)
    const sections: PdfReport['sections'] = []
    if (has('attention') && flagged.length)
      sections.push({ heading: `${t('Needs attention')} (${flagged.length})`, note: t('Absent without leave, late or leaving early three times or more, or a day with no clock-out to fix before payroll.'), lines: flagged.map(({ r, why }) => [[r.name, r.office, r.department].filter(Boolean).join(' - '), why.join(', ')]) })
    if (has('table') && columns.length)
      sections.push({
        heading: t('Totals for each person'),
        table: {
          head,
          groups: groups.map((g) => ({ name: g.name || (groups.length > 1 ? t(setup.groupBy === 'office' ? 'No office' : 'No department') : ''), rows: g.list.map((r) => [r.staffId, r.name, ...columns.map((c) => c.text(r))]), total: totals(g.list, '') })),
          total: totals(shown, `${t('Everyone')} (${shown.length})`),
        },
      })
    if (has('grid') && gridFits)
      sections.push({
        heading: t('Day-by-day grid'),
        newPage: true,
        note: Object.values(MARK).map((m) => `${m.letter} = ${t(m.label)}`).join('     '),
        table: {
          head: [t('Name'), ...dates.map((d) => String(parseDate(d).getDate()))],
          left: 1,
          compact: true,
          groups: groups.map((g) => ({ name: g.name, rows: g.list.map((r) => [r.name, ...dates.map((d) => r.entries.filter((e) => e.date === d).map((e) => t(MARK[e.mark].letter)).join(' '))]) })),
        },
      })
    return {
      fileName,
      title,
      period: periodFull,
      organisation: company,
      meta: [
        [t('Covers'), [office || t('All offices'), department || t('All departments')].join(', ')],
        [t('Prepared by'), profile.name],
        [t('Generated'), `${formatDate(today)}, ${formatClock(new Date())}`],
      ],
      kpis: [
        { label: t('People'), value: String(shown.length), note: t('{n} days worked', { n: days }) },
        { label: t('Attendance'), value: rate === null ? '-' : `${rate}%`, note: t('of {n} days due', { n: due }), warn: rate !== null && rate < 90 },
        { label: t('Hours worked'), value: formatDuration(total(shown, (r) => r.minutes)), note: timed < days ? t('from {a} of {b} days worked', { a: timed, b: days }) : t('after unpaid breaks'), warn: timed < days },
        { label: t('Overtime'), value: formatDuration(overtime + rest + holiday), note: rest + holiday >= 1 ? t('incl. rest days and holidays') : t('after the end time') },
        { label: t('Late arrivals'), value: String(late), note: t('{n} minutes in all', { n: Math.round(total(shown, (r) => r.lateMinutes)) }), warn: late > 0 },
        { label: t('Absent'), value: String(absent), note: t('+{n} on leave or MC', { n: off }), warn: absent > 0 },
      ],
      findings: has('charts') || findings.length ? { heading: t('Key findings'), items: findings } : undefined,
      trend: has('charts')
        ? { title: t('Attendance over time'), note: t('Each bar is everyone who was due that day: on time, late, on leave or MC, or absent.'), labels: trend.map((b) => b.label), series: PARTS.map((p) => ({ label: t(p.label), color: p.color, values: trend.map((b) => b.counts[p.id]) })) }
        : undefined,
      bars: has('charts')
        ? [
            ...(byGroup.length > 1 ? [{ title: t('Attendance by group'), note: t('Lowest first.'), items: byGroup.map((g) => ({ label: g.label, value: g.value, display: `${g.value}%`, note: g.note })), max: 100 }] : []),
            ...(lateList.length ? [{ title: t('Late most often'), note: t('Times late, and minutes late in all.'), items: lateList.map((l) => ({ label: l.label, value: l.value, display: String(l.value), note: l.note })), max: lateList[0].value }] : []),
          ]
        : [],
      sections,
      notes: {
        heading: t('How the figures are worked out'),
        items: [
          t('Hours are from clock-in to clock-out, less the unpaid break on a day of more than five hours. Overtime is the time worked after the shift’s end time. A day without a clock-out counts as a day worked, but adds no hours until the clock-out is filled in.'),
          t('Attendance is the days worked out of the days each person was due; MC and leave are left out. Work on a rest day or a public holiday is shown apart. Under the Employment Act 1955 overtime is paid at least 1.5 times the hourly rate on a normal day, 2 times on a rest day and 3 times on a public holiday. Click a name for that person’s timesheet.').replace(/ Click a name.*$/, '').replace(/ Klik nama.*$/, ''),
          ...(toDate_ ? [t('Figures are as at {time}. A day still in progress counts nobody as absent yet, and hours for people still at work are added when they clock out.', { time: `${formatDate(today)}, ${formatClock(new Date())}` })] : []),
        ],
      },
      footer: [company, t('Confidential'), t('Made with Attend')].filter(Boolean).join('  |  '),
      moreLabel: t('{n} more in the table'),
    }
  }

  if (selected) return <Timesheet row={selected} period={periodName} company={company} preparedBy={profile.name} onBack={() => setPerson(null)} />

  const nameButton = (r: PayrollRow) => (
    <button type="button" onClick={() => setPerson(r.key)} className="text-left font-medium text-accent hover:underline print:text-ink print:no-underline">
      {r.name}
    </button>
  )
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])
  const chip = (on: boolean) => `inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-white text-muted'}`

  return (
    <div className="report-wide space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted">
            <span className="hidden print:inline">{[periodFull, office, department].filter(Boolean).join(' · ')} · </span>
            {t('Days, hours, overtime and lateness for each person. Ready for payroll.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => setCustomising(!customising)}>{t('Customise report')}</Button>
          <Button variant="secondary" disabled={shown.every((r) => r.entries.length === 0)} busy={making} onClick={() => savePdf(pdf(), setMaking)}>{t('Download PDF')}</Button>
          <Button disabled={shown.every((r) => r.entries.length === 0)} onClick={exportCsv}>{t('Export for Excel')}</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <span className="block text-xs font-medium text-muted">{t('Period')}</span>
          <div className="mt-1 inline-flex rounded-lg border border-line bg-white p-0.5 text-sm" role="tablist">
            {(['week', 'month', 'year', 'custom'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={period === v} onClick={() => setPeriod(v)} className={`rounded-md px-3 py-1.5 font-medium ${period === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}>
                {t(v === 'week' ? 'Week' : v === 'month' ? 'Month' : v === 'year' ? 'Year' : 'Pick dates')}
              </button>
            ))}
          </div>
        </div>
        {period === 'week' && (
          <label className="block text-xs font-medium text-muted">
            {t('Any day in the week')}
            <input type="date" value={weekOf} max={today} onChange={(e) => e.target.value && setWeekOf(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        )}
        {period === 'month' && (
          <label className="block text-xs font-medium text-muted">
            {t('Month')}
            <input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        )}
        {period === 'year' && (
          <label className="block text-xs font-medium text-muted">
            {t('Year')}
            <select value={year} onChange={(e) => setYear(e.target.value)} className={`${inputClass} mt-1`}>
              {[0, 1, 2, 3].map((n) => String(Number(today.slice(0, 4)) - n)).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        )}
        {period === 'custom' && (
          <>
            <label className="block text-xs font-medium text-muted">
              {t('From')}
              <input type="date" value={fromDate} max={today} onChange={(e) => e.target.value && setFromDate(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-muted">
              {t('To')}
              <input type="date" value={toDate} min={fromDate} max={today} onChange={(e) => e.target.value && setToDate(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          </>
        )}
        <p className="pb-2.5 text-sm text-muted">
          {t('Covers {from} – {to}', { from: formatDate(from), to: formatDate(to) })}
          {to > today && from <= today && <span> · {t('up to today')}</span>}
        </p>
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

      {customising && (
        <Card className="space-y-4 p-5 print:hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{t('Customise report')}</h2>
            <button type="button" onClick={() => setSetup(DEFAULT_SETUP)} className="text-sm font-medium text-accent hover:underline">{t('Back to the standard report')}</button>
          </div>
          <p className="text-sm text-muted">{t('Choose what goes in the report. The screen, the PDF and the Excel file all follow it, and it is kept for next time on this device.')}</p>
          <fieldset>
            <legend className="text-xs font-medium text-muted">{t('Show')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {SECTIONS.map((x) => (
                <label key={x.id} className={chip(has(x.id))}>
                  <input type="checkbox" className="accent-accent" checked={has(x.id)} onChange={() => setSetup({ ...setup, sections: toggle(setup.sections, x.id) })} />
                  {t(x.label)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium text-muted">{t('Columns')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLUMNS.map((c) => (
                <label key={c.id} className={chip(setup.columns.includes(c.id))}>
                  <input type="checkbox" className="accent-accent" checked={setup.columns.includes(c.id)} onChange={() => setSetup({ ...setup, columns: COLUMNS.map((x) => x.id).filter((id) => (id === c.id ? !setup.columns.includes(id) : setup.columns.includes(id))) })} />
                  {t(c.label)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium text-muted">{t('Group people by')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {GROUPS.map((g) => (
                <label key={g.id} className={chip(setup.groupBy === g.id)}>
                  <input type="radio" name="groupBy" className="accent-accent" checked={setup.groupBy === g.id} onChange={() => setSetup({ ...setup, groupBy: g.id })} />
                  {t(g.label)}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      )}

      {failed ? (
        <ErrorNote>{t('The report could not be loaded. Check your connection and reload.')}</ErrorNote>
      ) : !rows ? (
        <PageLoader />
      ) : shown.every((r) => r.entries.length === 0) ? (
        <EmptyState title={t('Nothing recorded in this period')} text={t('Once people clock in, their days and hours appear here.')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label={t('People')} value={shown.length} />
            <Stat label={t('Attendance')} value={rate === null ? '—' : `${rate}%`} />
            <Stat
              label={t('Hours')}
              value={formatDuration(total(shown, (r) => r.minutes))}
              note={total(shown, (r) => r.timedDays) < days ? t('from {a} of {b} days worked', { a: total(shown, (r) => r.timedDays), b: days }) : undefined}
            />
            <Stat label={t('Overtime')} value={formatDuration(total(shown, (r) => r.overtime + r.restMinutes + r.holidayMinutes))} />
            <Stat label={t('Late')} value={total(shown, (r) => r.late)} />
          </div>

          {has('charts') && <ReportCharts rows={shown} groups={groups} from={from} to={to < today ? to : today} />}

          {has('attention') && flagged.length > 0 && (
            <Card className="break-inside-avoid p-5">
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

          {has('table') && columns.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="report-table w-full text-left text-sm" style={{ ['--min' as string]: `${16 + columns.length * 5.5}rem` }}>
                <thead className="bg-slate-50 text-xs text-muted">
                  <tr>
                    <th className="py-2.5 pr-2 pl-5 font-medium">{t('Student ID')}</th>
                    <th className="px-2 py-2.5 font-medium">{t('Name')}</th>
                    {columns.map((c) => (
                      <th key={c.id} className="px-2 py-2.5 text-right font-medium last:pr-5">{t(c.label)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-line">
                  {groups.map((g) => (
                    <Fragment key={g.name}>
                      {(g.name || groups.length > 1) && (
                        <tr className="bg-slate-50/70 text-xs font-semibold">
                          <td colSpan={2} className="py-2 pr-2 pl-5">{g.name || t(setup.groupBy === 'office' ? 'No office' : 'No department')} <span className="font-normal text-muted">· {g.list.length}</span></td>
                          {columns.map((c) => (
                            <td key={c.id} className="px-2 py-2 text-right whitespace-nowrap last:pr-5">{c.total?.(g.list)}</td>
                          ))}
                        </tr>
                      )}
                      {g.list.map((r) => (
                        <tr key={r.key}>
                          <td className="py-2.5 pr-2 pl-5 font-medium whitespace-nowrap">{r.staffId}</td>
                          <td className="px-2 py-2.5 break-words">{nameButton(r)}</td>
                          {columns.map((c) => (
                            <td key={c.id} className="px-2 py-2.5 text-right whitespace-nowrap last:pr-5">{c.cell(r)}</td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  <tr className="bg-slate-50 text-xs font-semibold">
                    <td colSpan={2} className="py-2.5 pr-2 pl-5">{t('Everyone')} <span className="font-normal text-muted">· {shown.length}</span></td>
                    {columns.map((c) => (
                      <td key={c.id} className="px-2 py-2.5 text-right whitespace-nowrap last:pr-5">{c.total?.(shown)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </Card>
          )}

          {has('grid') &&
            (gridFits ? (
              <MonthGrid groups={groups} dates={dates} nameButton={nameButton} />
            ) : (
              <p className="text-sm text-muted print:hidden">{t('The day-by-day grid shows up to two months. Pick a shorter period to see it.')}</p>
            ))}

          <div className="space-y-2 text-sm text-muted">
            <p>{t('Hours are from clock-in to clock-out, less the unpaid break on a day of more than five hours. Overtime is the time worked after the shift’s end time. A day without a clock-out counts as a day worked, but adds no hours until the clock-out is filled in.')}</p>
            <p>{t('Attendance is the days worked out of the days each person was due; MC and leave are left out. Work on a rest day or a public holiday is shown apart. Under the Employment Act 1955 overtime is paid at least 1.5 times the hourly rate on a normal day, 2 times on a rest day and 3 times on a public holiday. Click a name for that person’s timesheet.')}</p>
            <p className="hidden print:block">{t('Printed {date}', { date: formatDate(today) })}</p>
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
function Timesheet({ row, period, company, preparedBy, onBack }: { row: PayrollRow; period: string; company: string; preparedBy: string; onBack: () => void }) {
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
    if (e.open) bits.push(t('still at work'))
    if (e.dayType === 'rest') bits.push(t('rest day'))
    if (e.dayType === 'holiday') bits.push(t('public holiday'))
    return bits.join(' · ')
  }
  const time = (ms?: number) => (ms ? formatClock(new Date(ms)) : '—')
  const [making, setMaking] = useState(false)
  const day = (d: string) => parseDate(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const timesheetPdf = (): PdfReport => ({
    fileName: `timesheet-${(row.staffId || row.name).replace(/[^A-Za-z0-9]+/g, '-')}`,
    title: t('Timesheet'),
    period: `${row.name} - ${period}`,
    organisation: company,
    meta: [
      [t('Staff ID'), row.staffId || '-'],
      [t('Office'), [row.office, row.department].filter(Boolean).join(', ') || '-'],
      [t('Prepared by'), preparedBy],
      [t('Generated'), formatDate(isoDate())],
    ],
    kpis: [
      { label: t('Days worked'), value: String(row.days), note: row.halfDays ? t(row.halfDays === 1 ? '+1 half day' : '+{n} half days', { n: row.halfDays }) : '' },
      { label: t('Attendance'), value: row.rate === null ? '-' : `${row.rate}%`, warn: row.rate !== null && row.rate < 90 },
      { label: t('Hours worked'), value: formatDuration(row.minutes) },
      { label: t('Overtime'), value: formatDuration(row.overtime + row.restMinutes + row.holidayMinutes) },
      { label: t('Late arrivals'), value: String(row.late), note: row.late ? t('{n} minutes in all', { n: Math.round(row.lateMinutes) }) : '', warn: row.late > 0 },
      { label: t('Absent'), value: String(row.absent), note: t('{n} leave or MC', { n: row.leave + row.mc }), warn: row.absent > 0 },
    ],
    sections: [
      {
        heading: t('Day by day'),
        table: {
          head: ['Date', 'Shift', 'In', 'Out', 'Status', 'Hours'].map((h) => t(h)),
          left: 5,
          groups: [{ name: '', rows: row.entries.map((e) => [day(e.date), e.sessionName, time(e.clockIn), time(e.clockOut), status(e), e.minutes ? formatDuration(e.minutes) : '-']) }],
          total: [t('Total'), '', '', '', '', formatDuration(row.minutes)],
        },
      },
    ],
    signatures: [t('Employee signature'), t('Checked by (HR)')],
    footer: [company, t('Confidential'), t('Made with Attend')].filter(Boolean).join('  |  '),
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-sm font-medium text-accent hover:underline print:hidden">← {t('Back to report')}</button>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{row.name}</h1>
          <p className="text-sm text-muted">{[t('Timesheet'), period, row.staffId, row.office, row.department].filter(Boolean).join(' · ')}</p>
        </div>
        <Button variant="secondary" busy={making} onClick={() => savePdf(timesheetPdf(), setMaking)} className="print:hidden">{t('Download PDF')}</Button>
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
