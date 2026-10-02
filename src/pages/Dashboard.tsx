import { Link } from 'react-router-dom'
import { GettingStarted } from '../components/GettingStarted'
import { ShiftAlerts } from '../components/ShiftAlerts'
import { TodayHero, TodaySchedule } from '../components/TodayItems'
import { WeekSummary } from '../components/WeekSummary'
import { Card, EmptyState, ErrorNote, PageLoader, buttonClass } from '../components/ui'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
import { useMySessions, useNow } from '../hooks/useSessions'
import { type AgendaItem, agendaFor } from '../lib/agenda'
import { addDays, dayName, effectiveStatus, formatDate, formatRange, isoDate, parseDate } from '../lib/format'
import { locale, t } from '../lib/i18n'
import { has } from '../lib/purpose'

function greeting(hour: number): string {
  return hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening')
}

/** The lecturer's home: what is on now or next, today in order, and the week around it. */
export function Dashboard() {
  const profile = useProfile()
  const { data, loading, error } = useMySessions()
  const classes = useMyClasses()
  const now = useNow()
  const today = isoDate()

  if (loading || classes.loading) return <PageLoader />
  if (error) return <ErrorNote>{t('We could not load your sessions. Check your connection and reload.')}</ErrorNote>

  const sessions = data ?? []
  const myClasses = classes.data ?? []
  // Anything still running belongs on this screen, even if it was scheduled for another day.
  const carriedOver: AgendaItem[] = sessions
    .filter((s) => s.date !== today && effectiveStatus(s) === 'active')
    .map((session) => ({ key: session.id, date: session.date, name: session.name, startTime: session.startTime, endTime: session.endTime, state: 'active', session }))
  const todays = [...carriedOver, ...agendaFor(today, sessions, myClasses, today)]

  // The headline: whatever is running; otherwise the next thing that can still be started.
  const hero = todays.find((i) => i.state === 'active') ?? todays.find((i) => i.state === 'scheduled' || i.state === 'planned')
  const done = todays.filter((i) => i.state === 'ended').length
  const cancelled = todays.filter((i) => i.state === 'cancelled').length
  const running = todays.filter((i) => i.state === 'active').length

  // The next few days, including class meetings that are not sessions yet.
  const upcoming = Array.from({ length: 7 }, (_, i) => agendaFor(addDays(today, i + 1), sessions, myClasses, today))
    .flat()
    .filter((i) => i.state !== 'cancelled')
    .slice(0, 5)

  const isNew = sessions.length + myClasses.length === 0
  const guide = (
    <GettingStarted
      userId={profile.id}
      sessions={sessions}
      classes={myClasses}
      readyToday={todays.some((i) => i.state === 'scheduled' || i.state === 'planned')}
    />
  )
  const summary =
    todays.length === 0
      ? t('Nothing scheduled today')
      : [
          t(todays.length - cancelled === 1 ? '{n} session today' : '{n} sessions today', { n: todays.length - cancelled }),
          running > 0 && t('{n} running', { n: running }),
          done > 0 && t('{n} done', { n: done }),
          cancelled > 0 && t('{n} cancelled', { n: cancelled }),
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted capitalize">
            {new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {greeting(new Date().getHours())}, {profile.name}
          </h1>
          <p className="mt-1 text-sm text-muted">{summary}</p>
        </div>
        {has('clock') && (
          <Link to="/app/door" className={`${buttonClass()} self-start md:hidden`}>
            {t('Open door screen')}
          </Link>
        )}
        {/* On desktop the sidebar carries this button. */}
        <Link to="/app/new" className={`${buttonClass({ variant: 'secondary' })} self-start md:hidden ${has('clock') ? 'hidden' : ''}`}>
          {t('+ New session')}
        </Link>
      </div>

      {isNew ? (
        guide
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <div className="space-y-6">
            {has('clock') && <ShiftAlerts sessions={sessions} now={now} />}
            {hero ? (
              <TodayHero item={hero} now={now} />
            ) : todays.length > 0 ? (
              <Card className="p-6 text-center">
                <p className="text-lg font-semibold tracking-tight">{t('All done for today')}</p>
                <p className="mt-1 text-sm text-muted">{t('Nothing is left to start today. The records are in the schedule below.')}</p>
              </Card>
            ) : (
              <EmptyState
                title={t('Nothing scheduled today')}
                text={has('recurring') ? t('Create a one-off session, or add your semester classes once and they will appear here by themselves.') : t('Create a session and you can start taking attendance in seconds.')}
                action={
                  <Link to="/app/new" className={buttonClass({ size: 'lg' })}>
                    {t('Create a session')}
                  </Link>
                }
              />
            )}

            {todays.length > 0 && <TodaySchedule items={todays} />}
            {guide}
          </div>

          <div className="space-y-6">
            <WeekSummary sessions={sessions} classes={myClasses} today={today} />
            {upcoming.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
                  <h2 className="text-sm font-semibold">{t('Coming up')}</h2>
                  <Link to="/app/calendar" className="text-sm font-medium text-accent hover:underline">{t('Calendar')} ›</Link>
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {upcoming.map((item) => (
                    <li key={item.key}>
                      <Link
                        to={item.session ? `/app/session/${item.session.id}` : `/app/timetable/${item.due!.cls.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"
                      >
                        <span className="flex w-10 shrink-0 flex-col items-center rounded-md bg-canvas py-1">
                          <span className="text-[10px] font-medium text-muted uppercase">{dayName(parseDate(item.date).getDay()).slice(0, 3)}</span>
                          <span className="tabular text-sm font-semibold">{parseDate(item.date).getDate()}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {item.date === addDays(today, 1) ? t('Tomorrow') : formatDate(item.date)} · {formatRange(item)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
