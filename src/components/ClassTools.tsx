import { useEffect, useMemo, useState } from 'react'
import { getOrganisation } from '../data/account'
import { useProfile } from '../hooks/useAuth'
import { downloadCsv, slug } from '../lib/csv'
import { formatDate, isoDate } from '../lib/format'
import { getLang, t } from '../lib/i18n'
import { DEFAULT_LETTERS, type LetterKind, PLACEHOLDERS, barringListPdf, fill, loadLetters, lettersPdf, saveLetters } from '../lib/lettersPdf'
import type { ClassReport, StudentRow } from '../lib/report'
import type { WeeklyClass } from '../lib/types'
import { CODE_PRESETS, type Mark, type UniFormat, formatDay, loadFormat, saveFormat, uniCsv, uniRows } from '../lib/uniExport'
import { Button, Card, inputClass } from './ui'

const MARKS: [Mark, string][] = [
  ['present', 'Present'],
  ['late', 'Late'],
  ['excused', 'Excused'],
  ['mc', 'MC'],
  ['absent', 'Absent'],
]

const fileBase = (cls: WeeklyClass) => `${slug(cls.code || cls.name)}${cls.section ? `-sec-${slug(cls.section)}` : ''}`

/** One row of choices: a label on the left, the control on the right. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[11rem_1fr] sm:items-center">
      <span className="text-sm font-medium">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * Attendance in the shape the university's own system accepts: the lecturer sets the format once
 * (layout, codes, date order), sees a preview, and downloads. The format is remembered.
 */
export function UniExportPanel({ cls, report }: { cls: WeeklyClass; report: ClassReport }) {
  const [format, setFormatState] = useState<UniFormat>(loadFormat)
  const setFormat = (patch: Partial<UniFormat>) =>
    setFormatState((f) => {
      const next = { ...f, ...patch }
      saveFormat(next)
      return next
    })
  const preset = CODE_PRESETS.find((p) => MARKS.every(([m]) => p.codes[m] === format.codes[m]))?.id ?? 'custom'
  const preview = useMemo(() => uniRows(report, cls, format).slice(0, 5), [report, cls, format])
  const sample = report.held[0]?.date ?? isoDate()
  const download = (excel: boolean) => downloadCsv(`${fileBase(cls)}-attendance-for-university${excel ? '-excel' : ''}.csv`, uniCsv(report, cls, format), excel)
  const check = (key: 'header' | 'course' | 'section' | 'time', label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={format[key]} onChange={(e) => setFormat({ [key]: e.target.checked })} className="size-4 accent-accent" />
      {t(label)}
    </label>
  )

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="font-semibold">{t('Export for your university system')}</h2>
        <p className="text-sm text-muted">{t('Set the file up the way your university portal wants it, once. Attend remembers it on this device.')}</p>
      </div>

      <Row label={t('Layout')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['sheet', 'One row per student', 'A column for each class'], ['list', 'One row per class attended', 'Student, date and status on each row']] as const).map(([id, title, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFormat({ layout: id })}
              aria-pressed={format.layout === id}
              className={`rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${format.layout === id ? 'bg-accent-soft ring-accent' : 'ring-line hover:bg-slate-50'}`}
            >
              <span className="block font-semibold">{t(title)}</span>
              <span className="block text-xs text-muted">{t(text)}</span>
            </button>
          ))}
        </div>
      </Row>

      <Row label={t('Attendance codes')}>
        <div className="space-y-2">
          <select
            value={preset}
            onChange={(e) => {
              const p = CODE_PRESETS.find((x) => x.id === e.target.value)
              if (p) setFormat({ codes: p.codes })
            }}
            className={`${inputClass} !h-10`}
          >
            {CODE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
            {preset === 'custom' && <option value="custom">{t('Your own codes')}</option>}
          </select>
          <div className="grid grid-cols-5 gap-1.5">
            {MARKS.map(([mark, label]) => (
              <label key={mark} className="text-center text-[11px] text-muted">
                {t(label)}
                <input
                  value={format.codes[mark]}
                  maxLength={20}
                  onChange={(e) => setFormat({ codes: { ...format.codes, [mark]: e.target.value } })}
                  className="mt-0.5 h-9 w-full rounded-md border border-line px-1 text-center text-sm font-semibold text-ink"
                />
              </label>
            ))}
          </div>
        </div>
      </Row>

      <Row label={t('Date format')}>
        <select value={format.date} onChange={(e) => setFormat({ date: e.target.value as UniFormat['date'] })} className={`${inputClass} !h-10`}>
          {(['dmy', 'ymd', 'mdy'] as const).map((d) => (
            <option key={d} value={d}>{formatDay(sample, d)}</option>
          ))}
        </select>
      </Row>

      <Row label={t('Separator')}>
        <select value={format.separator} onChange={(e) => setFormat({ separator: e.target.value as UniFormat['separator'] })} className={`${inputClass} !h-10`}>
          <option value=",">{t('Comma (most systems)')}</option>
          <option value=";">{t('Semicolon')}</option>
        </select>
      </Row>

      <Row label={t('Also include')}>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {check('header', 'Column names in the first row')}
          {check('course', 'Course code')}
          {check('section', 'Section')}
          {check('time', 'Class start time')}
        </div>
      </Row>

      <div>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">{t('Preview')}</p>
        <div className="mt-2 overflow-x-auto rounded-lg ring-1 ring-line">
          <table className="tabular w-full text-left font-mono text-xs">
            <tbody className="divide-y divide-line">
              {preview.map((row, i) => (
                <tr key={i} className={i === 0 && format.header ? 'bg-slate-50 font-semibold' : ''}>
                  {row.slice(0, 7).map((v, j) => (
                    <td key={j} className="px-2.5 py-1.5 whitespace-nowrap">{v}</td>
                  ))}
                  {row.length > 7 && <td className="px-2.5 py-1.5 text-muted">…</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => download(false)}>{t('Download CSV')}</Button>
        <Button variant="secondary" onClick={() => download(true)}>{t('Download for Excel')}</Button>
      </div>
    </Card>
  )
}

type Tab = LetterKind | 'list'

/**
 * Warning letters, barring letters and the barring list for the faculty, as PDFs. The wording is
 * the lecturer's own: it starts from a standard letter and can be changed, and the change is kept.
 */
export function LettersPanel({ cls, report }: { cls: WeeklyClass; report: ClassReport }) {
  const profile = useProfile()
  const lang = getLang() === 'ms' ? 'ms' : 'en'
  const [tab, setTab] = useState<Tab>(report.rows.some((r) => r.level === 'barring') && !report.rows.some((r) => r.level === 'warning') ? 'barring' : 'warning')
  const [letters, setLetters] = useState(() => loadLetters(lang))
  // The letterhead: remembered once typed; otherwise the organisation's name, unless that is the
  // automatic "Name's sessions" a solo lecturer gets, which does not belong on a letter.
  const [institution, setInstitutionState] = useState(() => {
    try {
      return localStorage.getItem('attend.letterhead') ?? ''
    } catch {
      return ''
    }
  })
  const setInstitution = (v: string) => {
    setInstitutionState(v)
    try {
      localStorage.setItem('attend.letterhead', v)
    } catch {
      // Typed again next time.
    }
  }
  const [date, setDate] = useState(isoDate())
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    getOrganisation(profile.organisationId).then((o) => setInstitutionState((v) => v || (o?.name && !/['’]s sessions$/.test(o.name) ? o.name : '')), () => {})
  }, [profile.organisationId])

  const kind: LetterKind = tab === 'list' ? 'barring' : tab
  const due = report.rows.filter((r) => r.level === kind)
  const chosen = due.filter((r) => (picked ?? new Set(due.map((x) => x.key))).has(r.key))
  const ctx = { cls, report, lecturer: profile.name.trim(), institution: institution.trim(), date }
  const template = letters[kind]
  const setTemplate = (patch: Partial<typeof template>) => {
    const next = { ...letters, [kind]: { ...template, ...patch } }
    setLetters(next)
    saveLetters(lang, next)
  }
  const generated = t('Made with Attend on {date}', { date: formatDate(isoDate()) })

  const run = async (make: () => Promise<{ save(name: string): void }>, name: string) => {
    setBusy(true)
    setFailed(false)
    try {
      ;(await make()).save(name)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const downloadLetters = () =>
    run(
      () => lettersPdf(chosen, template, ctx, lang, { absentOn: t('Absent without a reason on'), date: t('Date'), course: t('Course'), section: t('Section'), generated }),
      `${fileBase(cls)}-${kind === 'warning' ? 'warning' : 'barring'}-letters.pdf`,
    )
  const downloadList = () =>
    run(
      () =>
        barringListPdf(ctx, {
          title: t('Barring list'),
          barring: t('Barring due'),
          warning: t('Warning due'),
          none: t('None'),
          head: ['#', t('Student ID'), t('Name'), t('Absent'), t('Attendance')],
          held: t('Classes held'),
          required: t('Attendance required'),
          lecturer: t('Lecturer'),
          hod: t('Head of department'),
          generated,
          date: t('Date'),
        }),
      `${fileBase(cls)}-barring-list.pdf`,
    )
  const toggle = (row: StudentRow) => {
    const next = new Set(picked ?? due.map((x) => x.key))
    if (next.has(row.key)) next.delete(row.key)
    else next.add(row.key)
    setPicked(next)
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="font-semibold">{t('Letters and barring list')}</h2>
        <p className="text-sm text-muted">{t('Warning letters, barring letters and the list for your faculty, ready to print or send. Check each one before you send it.')}</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1 text-sm font-medium">
        {([['warning', 'Warning letters', 'warning'], ['barring', 'Barring letters', 'barring'], ['list', 'Barring list', null]] as const).map(([id, label, level]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id)
              setPicked(null)
            }}
            className={`flex-1 rounded px-3 py-1.5 whitespace-nowrap transition ${tab === id ? 'bg-white text-ink shadow-card' : 'text-muted hover:text-ink'}`}
          >
            {t(label)}
            {level && <span className="tabular ml-1.5 text-xs text-muted">{report.rows.filter((r) => r.level === level).length}</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <label className="block text-sm font-medium">
          {t('University or faculty name')}
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={120} placeholder={t('e.g. Faculty of Computing, Sunrise University')} className={`${inputClass} mt-1 !h-10`} />
        </label>
        <label className="block text-sm font-medium">
          {t('Date on the letter')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || isoDate())} className={`${inputClass} mt-1 !h-10`} />
        </label>
      </div>

      {tab === 'list' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {t('Everyone due barring, then everyone due a warning, with their absences and attendance, and lines for you and your head of department to sign.')}
          </p>
          <Button busy={busy} onClick={downloadList}>{t('Download barring list (PDF)')}</Button>
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium">{t('Students')}</p>
            {due.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{kind === 'warning' ? t('Nobody is due a warning right now.') : t('Nobody is due barring right now.')}</p>
            ) : (
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {due.map((r) => (
                  <li key={r.key}>
                    <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ring-1 ring-line">
                      <input type="checkbox" checked={chosen.some((c) => c.key === r.key)} onChange={() => toggle(r)} className="size-4 accent-accent" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{r.studentId}</span> {r.studentName}
                      </span>
                      <span className="tabular text-xs text-muted">{t('{n} absent', { n: r.absent })}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              {t('Subject')}
              <input value={template.subject} onChange={(e) => setTemplate({ subject: e.target.value })} maxLength={200} className={`${inputClass} mt-1 !h-10`} />
            </label>
            <label className="block text-sm font-medium">
              {t('Letter')}
              <textarea value={template.body} onChange={(e) => setTemplate({ body: e.target.value })} rows={11} maxLength={4000} className={`${inputClass} mt-1 !h-auto py-2 leading-relaxed`} />
            </label>
            <p className="text-xs text-muted">
              {t('Words in braces are filled in for each student:')} <span className="font-mono">{PLACEHOLDERS.join(' ')}</span>{' '}
              <button type="button" onClick={() => setTemplate(DEFAULT_LETTERS[lang][kind])} className="font-medium text-accent">{t('Use the standard letter')}</button>
            </p>
          </div>

          {chosen[0] && (
            <div>
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">{t('Preview')}</p>
              <div className="mt-2 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-line ring-1 ring-line">
                <p className="font-semibold">{fill(template.subject, chosen[0], ctx, lang)}</p>
                <p className="mt-3">{fill(template.body, chosen[0], ctx, lang)}</p>
                <p className="mt-6 font-semibold">{ctx.lecturer}</p>
              </div>
            </div>
          )}

          <Button busy={busy} disabled={chosen.length === 0} onClick={downloadLetters}>
            {t(chosen.length === 1 ? 'Download 1 letter (PDF)' : 'Download {n} letters (PDF)', { n: chosen.length })}
          </Button>
        </>
      )}
      {failed && <p className="text-sm text-bad">{t('The PDF could not be made. Try again.')}</p>}
    </Card>
  )
}
