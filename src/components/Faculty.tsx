import { useEffect, useMemo, useState } from 'react'
import { subscribeOrgClasses } from '../data/classes'
import { fetchOrgSessions, loadFacultyReports } from '../data/faculty'
import { useProfile } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { downloadCsv } from '../lib/csv'
import { type RiskStudent, studentsAtRisk, teachingRecord, thisSemester } from '../lib/faculty'
import { addDays, courseLine, formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Session, WeeklyClass } from '../lib/types'
import { Paid, allowedOrTell } from './Paid'
import { Button, Card, EmptyState, ErrorNote, PageLoader, Stat, inputClass } from './ui'

const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n')
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`)
const title = (c: WeeklyClass) => [c.code, c.name].filter(Boolean).join(' ')

/** This semester's classes across the faculty, and every session they have had. */
function useFaculty() {
  const profile = useProfile()
  const today = isoDate()
  const live = useLive<WeeklyClass[]>((d, e) => subscribeOrgClasses(profile.organisationId, d, e), [profile.organisationId])
  const classes = useMemo(() => thisSemester(live.data ?? [], today), [live.data, today])
  // From the earliest first day of class; a faculty with no dates set looks back five months.
  const from = classes.reduce((first, c) => (c.startDate && c.startDate < first ? c.startDate : first), addDays(today, -150))
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let stale = false
    setFailed(false)
    fetchOrgSessions(profile.organisationId, from, today).then(
      (s) => !stale && setSessions(s),
      () => !stale && setFailed(true),
    )
    return () => {
      stale = true
    }
  }, [profile.organisationId, from, today])
  return { profile, today, classes, sessions, loading: live.loading || (!sessions && !failed), failed: failed || Boolean(live.error) }
}

/** Whether each lecturer is holding the classes on their timetable. */
export function TeachingRecord() {
  const { today, classes, sessions, loading, failed } = useFaculty()
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(() => (sessions ? teachingRecord(classes, sessions, today) : []), [classes, sessions, today])
  if (failed) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>
  if (loading) return <PageLoader />
  if (rows.length === 0) return <EmptyState title={t('No classes this semester yet')} text={t('Once lecturers add their classes with semester dates, this shows whether each one is being held.')} />

  const due = rows.reduce((n, r) => n + r.due, 0)
  const held = rows.reduce((n, r) => n + r.held, 0)
  const behind = rows.filter((r) => r.missed > 0)
  const never = rows.flatMap((r) => r.classes).filter((c) => c.held === 0 && c.due > 0)
  const exportList = (excel: boolean) =>
    allowedOrTell('export', t('Export to Excel is part of the paid plans.')) &&
    downloadCsv(
      `classes-held-${today}${excel ? '-excel' : ''}.csv`,
      csv([
        [t('Lecturer'), t('Class'), t('Due'), t('Held'), t('Not held'), t('Last held'), t('Dates not held')],
        ...rows.flatMap((r) => r.classes.map((c) => [r.name, courseLine(c.cls) || c.cls.name, c.due, c.held, c.missed.length, c.lastHeld ?? '', c.missed.map((m) => m.date).join(' ')])),
      ]),
      excel,
    )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('Classes held')} value={`${held} / ${due}`} note={t('of those due so far this semester')} />
        <Stat label={t('Held on time')} value={pct(due ? (held / due) * 100 : null)} />
        <Stat label={t('Lecturers with classes not held')} value={behind.length} note={t('of {n} lecturers', { n: rows.length })} />
        <Stat label={t('Classes never started')} value={never.length} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div>
            <h2 className="font-semibold">{t('By lecturer')}</h2>
            <p className="text-sm text-muted">{t('A class counts as held once attendance was opened for it. Cancelled classes and holidays are left out.')}</p>
          </div>
          <button type="button" onClick={() => exportList(true)} className="text-sm font-medium text-accent print:hidden">{t('Export for Excel')}</button>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.ownerId}>
              <button type="button" aria-expanded={open === r.ownerId} onClick={() => setOpen(open === r.ownerId ? null : r.ownerId)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left hover:bg-slate-50">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block text-sm text-muted">{t(r.classes.length === 1 ? '1 class' : '{n} classes', { n: r.classes.length })}</span>
                </span>
                <span className="flex w-40 items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full rounded-full ${r.missed === 0 ? 'bg-emerald-500' : (r.rate ?? 0) >= 80 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${r.rate ?? 0}%` }} />
                  </span>
                  <span className="tabular w-10 text-right text-sm font-semibold">{pct(r.rate)}</span>
                </span>
                <span className="tabular w-24 text-right text-sm text-muted">{r.held} / {r.due}</span>
                <span className={`w-28 rounded-full px-2.5 py-1 text-center text-xs font-semibold whitespace-nowrap ${r.missed ? 'bg-bad-soft text-bad' : 'bg-good-soft text-good'}`}>
                  {r.missed ? t('{n} not held', { n: r.missed }) : t('All held')}
                </span>
                <span aria-hidden className={`text-muted transition ${open === r.ownerId ? 'rotate-90' : ''}`}>›</span>
              </button>
              {open === r.ownerId && (
                <ul className="divide-y divide-line border-t border-line bg-slate-50/60 px-5">
                  {r.classes.map((c) => (
                    <li key={c.cls.id} className="py-3 text-sm">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{title(c.cls)}{c.cls.section ? ` · ${c.cls.section}` : ''}</span>
                        <span className="tabular text-muted">
                          {c.held} / {c.due} · {c.lastHeld ? t('last held {date}', { date: formatDate(c.lastHeld) }) : t('never held')}
                        </span>
                      </p>
                      {c.undated && <p className="mt-0.5 text-xs text-muted">{t('No semester dates on this class, so it cannot be checked against a timetable.')}</p>}
                      {c.missed.length > 0 && (
                        <p className="mt-1 text-xs text-bad">
                          {t('Not held')}: {c.missed.slice(-8).map((m) => formatDate(m.date).replace(/ \d{4}$/, '')).join(', ')}
                          {c.missed.length > 8 && ` (+${c.missed.length - 8})`}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/** Every student due a warning or barring in any class in the faculty. */
export function AtRisk({ organisation }: { organisation?: string }) {
  const { profile, today, classes, sessions, loading, failed } = useFaculty()
  const [list, setList] = useState<RiskStudent[] | null>(null)
  const [progress, setProgress] = useState<[number, number]>([0, 0])
  const [readFailed, setReadFailed] = useState(false)
  const [level, setLevel] = useState<'all' | 'barring' | 'warning' | 'many'>('all')
  const [search, setSearch] = useState('')
  const [making, setMaking] = useState(false)
  const ready = Boolean(sessions) && !loading
  const signature = `${classes.map((c) => c.id).join(',')}:${sessions?.length ?? ''}`

  useEffect(() => {
    if (!ready || !sessions) return
    let stale = false
    setList(null)
    setReadFailed(false)
    loadFacultyReports(profile, classes, sessions, (done, total) => !stale && setProgress([done, total])).then(
      (reports) => !stale && setList(studentsAtRisk(reports)),
      () => !stale && setReadFailed(true),
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature, profile.id])

  if (failed || readFailed) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>
  if (!list) {
    return (
      <div className="py-10 text-center">
        <PageLoader />
        {progress[1] > 0 && <p className="mt-2 text-sm text-muted">{t('Reading class {n} of {total}…', { n: Math.min(progress[0] + 1, progress[1]), total: progress[1] })}</p>}
      </div>
    )
  }

  const barring = list.filter((s) => s.level === 'barring')
  const warning = list.filter((s) => s.level === 'warning')
  const many = list.filter((s) => s.classes.length > 1)
  const q = search.trim().toLowerCase()
  const shown = (level === 'barring' ? barring : level === 'warning' ? warning : level === 'many' ? many : list).filter((s) => !q || s.studentName.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q))
  const word = (l: 'warning' | 'barring') => (l === 'barring' ? t('Barring due') : t('Warning due'))
  const flat = (students: RiskStudent[]) =>
    students.flatMap((s) => s.classes.map((c) => [s.studentId, s.studentName, title(c.cls), c.cls.section ?? '', c.cls.ownerName, word(c.level), c.absent, c.held, c.rate === null ? '' : c.rate.toFixed(1)]))
  const head = [t('Student ID'), t('Student Name'), t('Class'), t('Section'), t('Lecturer'), t('Status'), t('Absent'), t('Classes held'), '%']

  const exportList = (excel: boolean) =>
    allowedOrTell('export', t('Export to Excel is part of the paid plans.')) && downloadCsv(`students-at-risk-${today}${excel ? '-excel' : ''}.csv`, csv([head, ...flat(shown)]), excel)
  const downloadPdf = async () => {
    setMaking(true)
    try {
      const { downloadReportPdf } = await import('../lib/reportPdf')
      const section = (heading: string, students: RiskStudent[]) => ({
        heading,
        table: { head, left: 6, groups: [{ name: '', rows: flat(students).map((r) => r.map(String)) }] },
      })
      await downloadReportPdf({
        fileName: `students-at-risk-${today}`,
        title: t('Students at risk'),
        period: [organisation, formatDate(today)].filter(Boolean).join('  ·  '),
        meta: [
          [t('Prepared by'), profile.name],
          [t('Classes'), String(classes.length)],
          [t('Generated'), formatDate(today)],
        ],
        kpis: [
          { label: t('Barring due'), value: String(barring.length), warn: barring.length > 0 },
          { label: t('Warning due'), value: String(warning.length), warn: warning.length > 0 },
          { label: t('In more than one class'), value: String(many.length), warn: many.length > 0 },
        ],
        sections: [...(barring.length ? [section(t('Barring due'), barring)] : []), ...(warning.length ? [section(t('Warning due'), warning)] : [])],
        footer: t('Made with Dobry on {date}', { date: formatDate(today) }),
      })
    } finally {
      setMaking(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('Barring due')} value={barring.length} />
        <Stat label={t('Warning due')} value={warning.length} />
        <Stat label={t('In more than one class')} value={many.length} note={t('the same student, in trouble in several courses')} />
      </div>

      {list.length === 0 ? (
        <EmptyState title={t('Nobody is at risk')} text={t('No student in any class has missed enough to be due a warning or barring.')} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 print:hidden">
            <select aria-label={t('Status')} value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className={`${inputClass} !h-10 !w-auto`}>
              <option value="all">{t('Everyone at risk')} ({list.length})</option>
              <option value="barring">{t('Barring due')} ({barring.length})</option>
              <option value="warning">{t('Warning due')} ({warning.length})</option>
              <option value="many">{t('In more than one class')} ({many.length})</option>
            </select>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Find a student')} aria-label={t('Find a student')} className={`${inputClass} !h-10 min-w-40 flex-1`} />
            <button type="button" onClick={() => exportList(true)} className="px-2 text-sm font-medium text-accent">{t('Export for Excel')}</button>
            <Paid feature="pdf" what={t('Downloading as PDF is part of the paid plans.')}>
              <Button variant="secondary" busy={making} onClick={downloadPdf}>{t('Download PDF')}</Button>
            </Paid>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((s) => (
              <li key={s.key} className="px-5 py-3.5">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{s.studentName}</span>
                  <span className="tabular text-sm text-muted">{s.studentId}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.level === 'barring' ? 'bg-bad-soft text-bad' : 'bg-[#fff4d6] text-[#8a5a00]'}`}>{word(s.level)}</span>
                  {s.classes.length > 1 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{t('{n} classes', { n: s.classes.length })}</span>}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {s.classes.map((c) => (
                    <li key={c.cls.id} className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="min-w-0">
                        <span className={`mr-2 inline-block size-2 rounded-full ${c.level === 'barring' ? 'bg-rose-500' : 'bg-amber-400'}`} aria-hidden />
                        <span className="sr-only">{word(c.level)}: </span>
                        {title(c.cls)}
                        <span className="text-muted"> · {c.cls.ownerName}</span>
                      </span>
                      <span className="tabular text-muted">
                        {t('{n} absent of {held}', { n: c.absent, held: c.held })} · <span className="font-medium text-ink">{c.rate === null ? '—' : `${c.rate.toFixed(0)}%`}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {shown.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">{t('No student matches.')}</li>}
          </ul>
        </Card>
      )}
    </div>
  )
}
