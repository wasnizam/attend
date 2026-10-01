import { Link } from 'react-router-dom'
import { EmptyState, ErrorNote, PageLoader, buttonClass } from '../components/ui'
import { useMyClasses } from '../hooks/useClasses'
import { WEEK, classSlots, courseLine, dayName, formatDate, formatDays, formatRange, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { WeeklyClass } from '../lib/types'

function ClassLinks({ c }: { c: WeeklyClass }) {
  const pill = 'rounded-md bg-canvas px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft'
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
      <Link to={`/app/timetable/${c.id}/students`} className={pill}>
        {c.rosterCount ? t('{n} students', { n: c.rosterCount }) : t('+ Student list')}
      </Link>
      <Link to={`/app/timetable/${c.id}/report`} className={pill}>
        {t('Report')}
      </Link>
    </div>
  )
}

/** The lecturer's week for the current semester. Classes here show up on Today by themselves. */
export function Timetable() {
  const { data, loading, error } = useMyClasses()
  const today = new Date().getDay()

  if (loading) return <PageLoader />
  if (error) return <ErrorNote>{t('We could not load your timetable. Check your connection and reload.')}</ErrorNote>

  const date = isoDate()
  const all = data ?? []
  // Classes whose semester is over move out of the week view but keep their records and list.
  const classes = all.filter((c) => !c.endDate || c.endDate >= date)
  const finished = all.filter((c) => c.endDate && c.endDate < date)
  const days = WEEK.map((day) => ({
    day,
    items: classes
      .flatMap((c) => classSlots(c).filter((s) => s.day === day).map((slot) => ({ c, slot })))
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime)),
  })).filter((d) => d.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{t('Your classes this semester')}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Timetable')}</h1>
        </div>
        <Link to="/app/new?weekly=1" className={buttonClass({ variant: 'secondary' })}>
          {t('+ Add class')}
        </Link>
      </div>

      {all.length === 0 ? (
        <EmptyState
          title={t('No classes yet')}
          text={t('Add the classes you teach this semester once. They will be waiting on Today each week, ready to start.')}
          action={
            <Link to="/app/new?weekly=1" className={buttonClass({ size: 'lg' })}>
              {t('Add a semester class')}
            </Link>
          }
        />
      ) : (
        days.map(({ day, items }) => (
          <section key={day}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              {dayName(day)}
              {day === today && (
                <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent">{t('Today')}</span>
              )}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-card">
              {items.map(({ c, slot }) => (
                <li key={`${c.id}-${slot.startTime}`} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link to={`/app/timetable/${c.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="font-semibold sm:truncate">{c.name}</p>
                    <p className="text-sm text-muted">
                      {formatRange(slot)}
                      {courseLine(c) && ` · ${courseLine(c)}`}
                    </p>
                    <p className="text-xs text-muted">
                      {c.startDate && c.startDate > date
                        ? t('starts {date}', { date: formatDate(c.startDate) })
                        : c.endDate
                          ? t('until {date}', { date: formatDate(c.endDate) })
                          : ''}
                    </p>
                  </Link>
                  <ClassLinks c={c} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {all.length > 0 && classes.length === 0 && (
        <EmptyState
          title={t('No classes this semester')}
          text={t("Last semester's classes have finished. Add this semester's classes to see them here.")}
        />
      )}

      {finished.length > 0 && (
        <details className="rounded-xl bg-white shadow-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold select-none">
            {t('Past semesters')} <span className="font-normal text-muted">· {finished.length}</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {finished.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <Link to={`/app/timetable/${c.id}`} className="min-w-0 flex-1 hover:underline">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-sm text-muted">
                    {formatDays(c.days)} · {t('ended {date}', { date: formatDate(c.endDate!) })}
                  </p>
                </Link>
                <ClassLinks c={c} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
