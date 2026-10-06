import { Link, useParams } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorNote, PageLoader } from '../components/ui'
import { useMyClasses } from '../hooks/useClasses'
import { useClassReports } from '../hooks/useSubjectReport'
import { downloadCsv, slug } from '../lib/csv'
import { KIND_LABEL, formatPercent } from '../lib/format'
import { t } from '../lib/i18n'
import { type Subject, buildSubjectRows, subjectsOf } from '../lib/subject'

const csvCell = (v: string | number) => {
  const text = /^[=+\-@]/.test(String(v)) ? `'${v}` : String(v)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function SubjectReport() {
  const { subjectKey = '' } = useParams()
  const classes = useMyClasses()
  if (classes.loading) return <PageLoader />
  const subject = subjectsOf(classes.data ?? []).find((s) => s.key === subjectKey)
  if (!subject) {
    return (
      <EmptyState
        title={t('Subject not found')}
        text={t('A subject is made of classes that share the same course code.')}
        action={<Link to="/app/reports" className="font-medium text-accent">{t('Back to reports')}</Link>}
      />
    )
  }
  return <SubjectView key={subject.key} subject={subject} />
}

/** One student per row, with their attendance in the subject's lecture, tutorial and lab side by side. */
function SubjectView({ subject }: { subject: Subject }) {
  const { reports, failed } = useClassReports(subject.classes)
  if (failed) return <ErrorNote>{t('The report could not be loaded. Check your connection and reload.')}</ErrorNote>
  if (!reports) return <PageLoader />

  const { rows, required } = buildSubjectRows(subject, reports)
  const below = rows.filter((r) => r.lowest !== null && r.lowest < required).length

  const exportCsv = (excel: boolean) => {
    const lines = [
      [t('Student ID'), t('Student Name'), ...subject.kinds.map((k) => `${t(KIND_LABEL[k])} %`), `${t('Whole course')} %`],
      ...rows.map((r) => [r.studentId, r.studentName, ...subject.kinds.map((k) => (r.byKind[k]?.rate ?? null) === null ? '' : r.byKind[k]!.rate!.toFixed(1)), r.overall.rate === null ? '' : r.overall.rate.toFixed(1)]),
    ]
    downloadCsv(`${slug(subject.code)}-by-class-type${excel ? '-excel' : ''}.csv`, lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n', excel)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/app/reports" className="text-sm font-medium text-accent print:hidden">‹ {t('Reports')}</Link>
          <p className="mt-2 text-sm text-muted">{t('Subject report by class type')}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{subject.code}</h1>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" onClick={() => exportCsv(false)}>{t('Export CSV')}</Button>
          <Button variant="secondary" onClick={() => exportCsv(true)}>{t('Export for Excel')}</Button>
          <Button variant="secondary" onClick={() => window.print()}>{t('Print')}</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {subject.classes.map((c) => {
          const report = reports.get(c.id)
          return (
            <Link key={c.id} to={`/app/timetable/${c.id}/report`} className="rounded-xl bg-white p-4 shadow-card transition hover:shadow-pop">
              <p className="text-xs font-semibold text-accent">{t(KIND_LABEL[c.kind ?? 'lecture'])}</p>
              <p className="mt-0.5 truncate font-semibold">{c.name}</p>
              <p className="tabular mt-2 text-sm text-muted">
                {t('{n} classes held', { n: report?.held.length ?? 0 })} · {formatPercent(report?.average ?? null)}
              </p>
            </Link>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('No students yet')} text={t('Students appear here once a class has a list or a session has been held.')} />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-muted">
                <tr>
                  <th className="py-2.5 pr-2 pl-5 font-medium">{t('Student ID')}</th>
                  <th className="px-2 py-2.5 font-medium">{t('Name')}</th>
                  {subject.kinds.map((k) => (
                    <th key={k} className="px-3 py-2.5 text-right font-medium">{t(KIND_LABEL[k])}</th>
                  ))}
                  <th className="py-2.5 pr-5 pl-3 text-right font-medium">{t('Whole course')}</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2.5 pr-2 pl-5 font-medium whitespace-nowrap">{r.studentId}</td>
                    <td className="px-2 py-2.5 break-words">{r.studentName}</td>
                    {subject.kinds.map((k) => {
                      const f = r.byKind[k]
                      const low = f?.rate !== null && f?.rate !== undefined && f.rate < required
                      return (
                        <td
                          key={k}
                          title={f ? t('{a} of {c} classes attended', { a: f.attended, c: f.counted }) : t('Not on this class’s list')}
                          className={`px-3 py-2.5 text-right ${low ? 'bg-bad-soft font-semibold text-bad' : ''}`}
                        >
                          {f ? formatPercent(f.rate) : <span className="text-slate-300">·</span>}
                          {low && <span className="sr-only"> ({t('below {n}%', { n: required })})</span>}
                        </td>
                      )
                    })}
                    <td
                      title={t('{a} of {c} class hours attended', { a: r.overall.attendedHours.toFixed(1), c: r.overall.countedHours.toFixed(1) })}
                      className={`py-2.5 pr-5 pl-3 text-right font-semibold ${r.overall.rate !== null && r.overall.rate < required ? 'bg-bad-soft text-bad' : ''}`}
                    >
                      {formatPercent(r.overall.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted">
            {t('{n} students are below {p}% in at least one class type. Each type is counted on its own; a dot means the student is not in that class. Excused and MC absences are left out.', { n: below, p: required })}{' '}
            {t('“Whole course” adds every class type together by class hours, for universities that apply the rule to the course as a whole.')}
          </p>
        </>
      )}
    </div>
  )
}
