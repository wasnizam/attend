import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { STATUS_LABEL } from '../components/AttendanceList'
import { AttendanceTrend, LevelBar, LevelTag } from '../components/charts'
import { Button, Card, EmptyState, ErrorNote, PageLoader, Stat } from '../components/ui'
import { setThresholds } from '../data/classes'
import { useClassReport } from '../hooks/useClassReport'
import { useMyClasses } from '../hooks/useClasses'
import { downloadCsv, slug } from '../lib/csv'
import { courseLine, effectiveStatus, formatDate, formatDuration, formatPercent } from '../lib/format'
import { locale, t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { type ClassReport, DEFAULT_BAR, DEFAULT_WARN, type StudentRow } from '../lib/report'
import type { AttendanceStatus, WeeklyClass } from '../lib/types'

const VIEWS = ['students', 'monthly', 'sheet', 'sessions'] as const
type View = (typeof VIEWS)[number]
const VIEW_LABEL: Record<View, string> = { students: 'Students', monthly: 'Monthly', sheet: 'Attendance sheet', sessions: 'Sessions' }

/** "2026-10" -> "Oct 2026" */
const monthLabel = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(locale(), { month: 'short', year: 'numeric' })

// One letter per cell on the sheet; the legend under it spells them out.
const MARK: Record<AttendanceStatus | 'absent', [string, string]> = {
  present: ['✓', 'text-good'],
  late: ['L', 'text-[#b25e00]'],
  excused: ['E', 'text-slate-500'],
  mc: ['MC', 'text-sky-700'],
  absent: ['✗', 'text-bad'],
}

const csvCell = (v: string | number) => {
  const text = /^[=+\-@]/.test(String(v)) ? `'${v}` : String(v)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const toCsv = (lines: (string | number)[][]) => lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'

export function Report() {
  const { classId } = useParams()
  const classes = useMyClasses()
  if (classes.loading) return <PageLoader />
  const cls = classes.data?.find((c) => c.id === classId)
  if (!cls) {
    return (
      <EmptyState
        title={t('Class not found')}
        text={t('It may have been removed from your timetable.')}
        action={<Link to="/app/reports" className="font-medium text-accent">{t('Back to reports')}</Link>}
      />
    )
  }
  return <ClassReportView key={cls.id} cls={cls} />
}

/** One class across the semester: who needs a warning, how each session went, and the sheet the faculty asks for. */
function ClassReportView({ cls }: { cls: WeeklyClass }) {
  const { report, loading, failed } = useClassReport(cls)
  const [view, setView] = useState<View>('students')
  const [open, setOpen] = useState<string | null>(null)

  if (loading) return <PageLoader />
  if (failed || !report) return <ErrorNote>{t('The report could not be loaded. Check your connection and reload.')}</ErrorNote>

  const { held, planned, rows, trend, average, warnAfter, barAfter, months } = report
  // The warning / barring ladder is a university rule; other organisations just see the figures.
  const rule = has('barring')
  const warnPct = cls.warnPct ?? DEFAULT_WARN
  const barPct = cls.barPct ?? DEFAULT_BAR
  const due = (level: StudentRow['level']) => rows.filter((r) => r.level === level).length
  const file = `${slug(cls.name)}${cls.section ? `-sec-${slug(cls.section)}` : ''}`

  const exportSummary = (excel: boolean) =>
    downloadCsv(
      `${file}-semester-report${excel ? '-excel' : ''}.csv`,
      toCsv([
        [...['Student ID', 'Student Name', 'Present', 'Late', 'Excused', 'MC', 'Absent', 'Attendance %', 'Status', 'Can still miss'], ...(has('clock') ? ['Hours'] : [])].map((h) => t(h)),
        ...rows.map((r) => [r.studentId, r.studentName, r.present, r.late, r.excused, r.mc, r.absent, r.rate === null ? '' : r.rate.toFixed(1), t(levelText(r.level)), r.canMiss, ...(has('clock') ? [(r.minutes / 60).toFixed(2)] : [])]),
      ]),
      excel,
    )

  const exportMonthly = (excel: boolean) =>
    downloadCsv(
      `${file}-monthly-attendance${excel ? '-excel' : ''}.csv`,
      toCsv([
        [t('Student ID'), t('Student Name'), ...months.map((m) => `${monthLabel(m.key)} %`), `${t('Semester')} %`],
        ...rows.map((r) => [
          r.studentId,
          r.studentName,
          ...months.map((m) => {
            const rate = r.monthly.get(m.key)?.rate
            return rate === null || rate === undefined ? '' : rate.toFixed(1)
          }),
          r.rate === null ? '' : r.rate.toFixed(1),
        ]),
      ]),
      excel,
    )

  const exportSheet = (excel: boolean) =>
    downloadCsv(
      `${file}-attendance-sheet${excel ? '-excel' : ''}.csv`,
      toCsv([
        [t('Student ID'), t('Student Name'), ...held.map((s) => formatDate(s.date)), t('Absent'), t('Attendance %')],
        ...rows.map((r) => [
          r.studentId,
          r.studentName,
          ...held.map((s) => t(r.marks.get(s.id) ? STATUS_LABEL[r.marks.get(s.id)!] : 'Absent')),
          r.absent,
          r.rate === null ? '' : r.rate.toFixed(1),
        ]),
      ]),
      excel,
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/app/reports" className="text-sm font-medium text-accent print:hidden">‹ {t('Reports')}</Link>
          <p className="mt-2 text-sm text-muted">{courseLine(cls) || t('Semester report')}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{cls.name}</h1>
        </div>
        <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
          {t('Print')}
        </Button>
      </div>

      {held.length === 0 ? (
        <EmptyState title={t('No sessions held yet')} text={t('The report fills in after the first session of this class.')} />
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-2 ${rule ? 'lg:grid-cols-4' : ''}`}>
            <Stat label={t('Classes held')} value={planned > held.length ? `${held.length} / ${planned}` : held.length} />
            <Stat label={t('Average attendance')} value={formatPercent(average)} />
            {rule && <Stat label={t('Warning due')} value={due('warning')} />}
            {rule && <Stat label={t('Barring due')} value={due('barring')} />}
          </div>

          <div className={`grid gap-4 ${rule ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
            <Card className="p-5">
              <h2 className="font-semibold">{t('Attendance by session')}</h2>
              <p className="text-sm text-muted">{t('Share of the class present each time it met.')}</p>
              <div className="mt-3">
                <AttendanceTrend trend={trend} />
              </div>
            </Card>
            {rule && <Card className="p-5">
              <h2 className="font-semibold">{t('Where students stand')}</h2>
              <p className="text-sm text-muted">{t('Against the 80% rule, going by absences without a reason.')}</p>
              <div className="mt-5">
                <LevelBar rows={rows} />
              </div>
              <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm print:hidden">
                {([['warnPct', 'Warning after missing', warnPct, warnAfter], ['barPct', 'Barring after missing', barPct, barAfter]] as const).map(([field, label, value, classes]) => (
                  <label key={field} className="flex items-center justify-between gap-2">
                    <span className="text-muted">{t(label)}</span>
                    <span className="flex items-center gap-2">
                      <select
                        value={value}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setThresholds(cls.id, field === 'warnPct' ? n : warnPct, field === 'barPct' ? n : barPct).catch(() => {})
                        }}
                        className="h-8 rounded-md border border-line bg-white px-2 !text-sm font-medium"
                      >
                        {(field === 'warnPct' ? [5, 10, 15] : [15, 20, 25, 30]).filter((n) => (field === 'warnPct' ? n < barPct : n > warnPct)).map((n) => (
                          <option key={n} value={n}>{n}%</option>
                        ))}
                      </select>
                      <span className="tabular w-20 text-right text-xs text-muted">{t('{n} classes', { n: classes })}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Card>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex gap-1 rounded-md bg-white p-1 shadow-card">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${view === v ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
                >
                  {t(VIEW_LABEL[v])}
                </button>
              ))}
            </div>
            {view !== 'sessions' && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => (view === 'sheet' ? exportSheet : view === 'monthly' ? exportMonthly : exportSummary)(false)}>{t('Export CSV')}</Button>
                <Button variant="secondary" onClick={() => (view === 'sheet' ? exportSheet : view === 'monthly' ? exportMonthly : exportSummary)(true)}>{t('Export for Excel')}</Button>
              </div>
            )}
          </div>

          {view === 'students' && <StudentsTable report={report} open={open} setOpen={setOpen} />}
          {view === 'monthly' && <Monthly report={report} />}
          {view === 'sheet' && <Sheet report={report} />}
          {view === 'sessions' && (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {[...trend].reverse().map(({ session: s, present, rate }) => (
                  <li key={s.id}>
                    <Link to={`/app/session/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50">
                      <span className="font-medium">
                        {formatDate(s.date)}
                        {effectiveStatus(s) === 'active' && <span className="ml-2 text-xs font-semibold text-good">{t('Session Active')}</span>}
                      </span>
                      <span className="tabular text-sm">
                        <span className="font-semibold">{t('{n} present', { n: present })}</span>
                        <span className="ml-2 text-muted">{formatPercent(rate)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-xs text-muted">
            {t('Late counts as attended. Excused and MC absences are not counted against a student. Class totals come from the timetable and do not allow for holidays.')}
          </p>
        </>
      )}
    </div>
  )
}

const levelText = (level: StudentRow['level']) => (level === 'barring' ? 'Barring due' : level === 'warning' ? 'Warning due' : 'On track')

/** The working list: worst first, with what to tell each student. Tap a row for their full record. */
function StudentsTable({ report, open, setOpen }: { report: ClassReport; open: string | null; setOpen: (key: string | null) => void }) {
  const { rows, held } = report
  const rule = has('barring')
  const mc = has('mc')
  const clock = has('clock')
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-muted">
          <tr>
            <th className="py-2.5 pr-2 pl-5 font-medium">{t('Student ID')}</th>
            <th className="px-2 py-2.5 font-medium">{t('Name')}</th>
            {rule && <th className="px-2 py-2.5 font-medium">{t('Status')}</th>}
            <th className="px-2 py-2.5 text-right font-medium">{t('Absent')}</th>
            <th className="px-2 py-2.5 text-right font-medium">{t('Late')}</th>
            <th className="px-2 py-2.5 text-right font-medium">{t('Excused')}</th>
            {mc && <th className="px-2 py-2.5 text-right font-medium">{t('MC')}</th>}
            <th className="px-2 py-2.5 text-right font-medium">%</th>
            {clock && <th className="py-2.5 pr-5 pl-2 text-right font-medium">{t('Hours')}</th>}
            {rule && <th className="py-2.5 pr-5 pl-2 text-right font-medium">{t('Can still miss')}</th>}
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-line">
          {rows.map((r) => (
            <Fragment key={r.key}>
              <tr onClick={() => setOpen(open === r.key ? null : r.key)} className="cursor-pointer hover:bg-slate-50" aria-expanded={open === r.key}>
                <td className="py-2.5 pr-2 pl-5 font-medium whitespace-nowrap">{r.studentId}</td>
                <td className="px-2 py-2.5 break-words">{r.studentName}</td>
                {rule && <td className="px-2 py-2.5"><LevelTag level={r.level} /></td>}
                <td className="px-2 py-2.5 text-right font-semibold">{r.absent}</td>
                <td className="px-2 py-2.5 text-right">{r.late}</td>
                <td className="px-2 py-2.5 text-right">{r.excused}</td>
                {mc && <td className="px-2 py-2.5 text-right">{r.mc}</td>}
                <td className="px-2 py-2.5 text-right font-semibold">{formatPercent(r.rate)}</td>
                {clock && <td className="py-2.5 pr-5 pl-2 text-right whitespace-nowrap">{formatDuration(r.minutes)}</td>}
                {rule && <td className="py-2.5 pr-5 pl-2 text-right">{r.level === 'barring' ? '—' : r.canMiss}</td>}
              </tr>
              {open === r.key && (
                <tr className="bg-slate-50/70">
                  <td colSpan={9} className="px-5 py-3">
                    <p className="text-xs font-medium text-muted">{t('Record for every class held')}</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {held.map((s) => {
                        const status = r.marks.get(s.id) ?? 'absent'
                        return (
                          <li key={s.id}>
                            <Link to={`/app/session/${s.id}`} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs shadow-card hover:bg-slate-50">
                              <span className={`font-semibold ${MARK[status][1]}`}>{MARK[status][0]}</span>
                              <span>{formatDate(s.date).replace(/ \d{4}$/, '')}</span>
                              <span className="text-muted">{t(status === 'absent' ? 'Absent' : STATUS_LABEL[status])}</span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/**
 * The 80% rule month by month: each student's attendance for every month's classes,
 * with any month below the required level marked.
 */
function Monthly({ report }: { report: ClassReport }) {
  const { rows, months, required } = report
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-xs text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 py-2.5 pr-3 pl-5 font-medium">{t('Student')}</th>
              {months.map((m) => (
                <th key={m.key} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                  {monthLabel(m.key)}
                  <span className="block font-normal">{t(m.held === 1 ? '{n} class' : '{n} classes', { n: m.held })}</span>
                </th>
              ))}
              <th className="py-2.5 pr-5 pl-3 text-right font-medium">{t('Semester')}</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="sticky left-0 z-10 border-t border-line bg-white py-2 pr-3 pl-5 whitespace-nowrap">
                  <span className="font-medium">{r.studentId}</span>
                  <span className="ml-2 text-muted">{r.studentName}</span>
                </td>
                {months.map((m) => {
                  const cell = r.monthly.get(m.key)
                  const low = cell?.rate !== null && cell?.rate !== undefined && cell.rate < required
                  return (
                    <td
                      key={m.key}
                      title={cell ? t('{a} of {c} classes attended', { a: cell.attended, c: cell.counted }) : undefined}
                      className={`border-t border-line px-3 py-2 text-right ${low ? 'bg-bad-soft font-semibold text-bad' : ''}`}
                    >
                      {formatPercent(cell?.rate ?? null)}
                      {low && <span className="sr-only"> ({t('below {n}%', { n: required })})</span>}
                    </td>
                  )
                })}
                <td className={`border-t border-line py-2 pr-5 pl-3 text-right font-semibold ${r.rate !== null && r.rate < required ? 'text-bad' : ''}`}>
                  {formatPercent(r.rate)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular text-sm">
            <tr className="bg-slate-50">
              <td className="sticky left-0 z-10 border-t border-line bg-slate-50 py-2.5 pr-3 pl-5 font-medium">{t('Class average')}</td>
              {months.map((m) => (
                <td key={m.key} className="border-t border-line px-3 py-2.5 text-right font-semibold">{formatPercent(m.average)}</td>
              ))}
              <td className="border-t border-line py-2.5 pr-5 pl-3 text-right font-semibold">{formatPercent(report.average)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-muted">
        {t('A month in red is below {n}% for that month’s classes. Excused and MC absences are left out.', { n: required })}
      </p>
    </>
  )
}

/** The classic sheet: students down the side, dates across the top. */
function Sheet({ report }: { report: ClassReport }) {
  const { rows, held } = report
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-xs text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 py-2.5 pr-3 pl-5 font-medium">{t('Student')}</th>
              {held.map((s) => (
                <th key={s.id} className="px-1.5 py-2.5 text-center font-medium whitespace-nowrap">
                  {formatDate(s.date).replace(/ \d{4}$/, '')}
                </th>
              ))}
              <th className="px-2 py-2.5 text-right font-medium">{t('Absent')}</th>
              <th className="py-2.5 pr-5 pl-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="sticky left-0 z-10 border-t border-line bg-white py-2 pr-3 pl-5 whitespace-nowrap">
                  <span className="font-medium">{r.studentId}</span>
                  <span className="ml-2 text-muted">{r.studentName}</span>
                </td>
                {held.map((s) => {
                  const status = r.marks.get(s.id) ?? 'absent'
                  return (
                    <td key={s.id} className={`border-t border-line px-1.5 py-2 text-center font-semibold ${MARK[status][1]}`} title={t(status === 'absent' ? 'Absent' : STATUS_LABEL[status])}>
                      {MARK[status][0]}
                    </td>
                  )
                })}
                <td className="border-t border-line px-2 py-2 text-right font-semibold">{r.absent}</td>
                <td className="border-t border-line py-2 pr-5 pl-2 text-right font-semibold">{formatPercent(r.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(['present', 'late', 'excused', 'mc', 'absent'] as const).map((status) => (
          <span key={status}>
            <span className={`font-semibold ${MARK[status][1]}`}>{MARK[status][0]}</span> {t(status === 'absent' ? 'Absent' : STATUS_LABEL[status])}
          </span>
        ))}
      </p>
    </>
  )
}
