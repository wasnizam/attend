import { Link } from 'react-router-dom'
import { LevelBar } from '../components/charts'
import { Card, EmptyState, ErrorNote, PageLoader, Spinner, buttonClass } from '../components/ui'
import { useClassReport } from '../hooks/useClassReport'
import { useMyClasses } from '../hooks/useClasses'
import { courseLine, formatPercent, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { WeeklyClass } from '../lib/types'

/** One class at a glance: how far in, how well attended, and who needs attention. */
function ClassSummary({ cls }: { cls: WeeklyClass }) {
  const { report, loading, failed } = useClassReport(cls)
  return (
    <Link to={`/app/timetable/${cls.id}/report`} className="block rounded-xl bg-white p-5 shadow-card transition hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight">{cls.name}</p>
          <p className="truncate text-sm text-muted">{courseLine(cls) || ' '}</p>
        </div>
        <span className="shrink-0 text-sm font-medium text-accent">{t('Open')} ›</span>
      </div>
      {loading ? (
        <div className="mt-5"><Spinner /></div>
      ) : failed || !report ? (
        <p className="mt-4 text-sm text-bad">{t('The report could not be loaded. Check your connection and reload.')}</p>
      ) : report.held.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t('No sessions held yet')}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted">{t('Classes held')}</dt>
              <dd className="tabular text-xl font-semibold">
                {report.held.length}
                {report.planned > report.held.length && <span className="text-sm font-normal text-muted"> / {report.planned}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('Average attendance')}</dt>
              <dd className="tabular text-xl font-semibold">{formatPercent(report.average)}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <LevelBar rows={report.rows} />
          </div>
        </>
      )}
    </Link>
  )
}

/** The lecturer's reports home: every class, with who is due a warning or barring. */
export function Reports() {
  const { data, loading, error } = useMyClasses()
  if (loading) return <PageLoader />
  if (error) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>

  const today = isoDate()
  const all = data ?? []
  const current = all.filter((c) => !c.endDate || c.endDate >= today)
  const past = all.filter((c) => c.endDate && c.endDate < today)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{t('Attendance for each class this semester')}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Reports')}</h1>
        </div>
        <Link to="/app/history" className={buttonClass({ variant: 'secondary' })}>
          {t('Past sessions')}
        </Link>
      </div>

      {all.length === 0 ? (
        <EmptyState
          title={t('No classes yet')}
          text={t('Reports are built per class. Add a semester class and hold a session to see one.')}
          action={
            <Link to="/app/new?weekly=1" className={buttonClass({ size: 'lg' })}>
              {t('Add a semester class')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {current.map((c) => (
              <ClassSummary key={c.id} cls={c} />
            ))}
          </div>
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('Past semesters')}</h2>
              <Card className="divide-y divide-line">
                {past.map((c) => (
                  <Link key={c.id} to={`/app/timetable/${c.id}/report`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-sm text-muted">{courseLine(c)}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-accent">{t('Open')} ›</span>
                  </Link>
                ))}
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  )
}
