import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { startClassSession } from '../data/classes'
import { startSession } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { usePresentCount } from '../hooks/useSessions'
import type { AgendaItem } from '../lib/agenda'
import { courseLine, formatPercent, formatRange, formatTime, parseDate, percent } from '../lib/format'
import { t } from '../lib/i18n'
import { rotatePref } from '../lib/prefs'
import type { Session } from '../lib/types'
import { STATE_DOT } from './DayAgenda'
import { RemoteLine } from './SessionCard'
import { Button, Card, ErrorNote, buttonClass, friendlyError } from './ui'

/** Starting works the same for a one-off session and for a class meeting that has no session yet. */
function useStart(item: AgendaItem) {
  const profile = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      if (item.session) {
        await startSession(item.session, rotatePref())
        navigate(`/app/session/${item.session.id}`)
      } else {
        navigate(`/app/session/${await startClassSession(profile, item.due!.cls, item.date, item.due!.slot, rotatePref())}`)
      }
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }
  return { start, busy, error }
}

const detailsOf = (item: AgendaItem) => item.session ?? item.due!.cls
const hrefOf = (item: AgendaItem) => (item.session ? `/app/session/${item.session.id}` : `/app/timetable/${item.due!.cls.id}`)

/** "25 min", "2 h 10 min" */
function span(minutes: number): string {
  const m = Math.max(1, Math.round(Math.abs(minutes)))
  return m < 60 ? t('{n} min', { n: m }) : t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 })
}

/** Present count that ticks up live while a session is running. */
function LiveCount({ session, big = false }: { session: Session; big?: boolean }) {
  const present = usePresentCount(session, useProfile())
  const pct = percent(present, session.expected)
  return (
    <p className="tabular text-sm text-muted">
      <span className={`font-semibold tracking-tight text-ink ${big ? 'text-4xl' : 'text-base'}`}>
        {present}
        {session.expected ? ` / ${session.expected}` : ''}
      </span>{' '}
      {t('Present')}
      {pct !== null && <span> · {formatPercent(pct)}</span>}
    </p>
  )
}

/**
 * The one thing that matters right now: the session that is running, or the next one
 * to start. Its button is the biggest thing on the screen.
 */
export function TodayHero({ item, now }: { item: AgendaItem; now: number }) {
  const { start, busy, error } = useStart(item)
  const details = detailsOf(item)
  const live = item.state === 'active'
  const minutes = (parseDate(item.date, item.startTime).getTime() - now) / 60_000
  const label = live
    ? t('Happening now')
    : minutes > 0
      ? t('Next up · starts in {x}', { x: span(minutes) })
      : t('Ready to start · due {x} ago', { x: span(minutes) })
  const listed = item.session?.expected ?? item.due?.cls.rosterCount ?? item.due?.cls.expected

  return (
    <Card className="relative overflow-hidden">
      <div className={`h-1 ${live ? 'bg-good' : 'bg-accent'}`} />
      <div className="p-5 sm:p-7">
        <p className={`inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${live ? 'text-good' : 'text-accent'}`}>
          {live && <span className="size-2 animate-pulse rounded-full bg-good" />}
          {label}
        </p>
        <Link to={hrefOf(item)} className="mt-2 block text-2xl font-semibold tracking-tight hover:underline sm:text-3xl">
          {item.name}
        </Link>
        <p className="mt-1 text-muted">
          {formatRange(item)}
          {courseLine(details) && ` · ${courseLine(details)}`}
        </p>
        <RemoteLine item={details} />

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {live && item.session ? (
            <LiveCount session={item.session} big />
          ) : (
            <p className="text-sm text-muted">
              {item.due?.cls.rosterCount
                ? t('{n} students on the list', { n: item.due.cls.rosterCount })
                : listed
                  ? t('{n} expected', { n: listed })
                  : t('Ready when you are')}
            </p>
          )}
          {live ? (
            <Link to={hrefOf(item)} className={`${buttonClass({ size: 'lg' })} sm:min-w-56`}>
              {t('Show QR')}
            </Link>
          ) : (
            <Button size="lg" busy={busy} onClick={start} className="sm:min-w-56">
              {t('Start Attendance')}
            </Button>
          )}
        </div>
        <div className="mt-3 empty:hidden">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </Card>
  )
}

/** One line of today's timeline. */
function ScheduleRow({ item, isLast }: { item: AgendaItem; isLast: boolean }) {
  const { start, busy, error } = useStart(item)
  const s = item.session
  const startable = item.state === 'scheduled' || item.state === 'planned'
  const small = 'h-9 px-3.5'
  return (
    <li className="flex gap-3 sm:gap-4">
      <div className="tabular w-[4.25rem] shrink-0 pt-3.5 text-right text-sm">
        <p className="font-semibold">{formatTime(item.startTime)}</p>
        <p className="text-xs text-muted">{formatTime(item.endTime)}</p>
      </div>
      {/* The rail: a dot per session, joined by a line. */}
      <div className="flex flex-col items-center pt-[1.15rem]">
        <span className={`size-2.5 shrink-0 rounded-full ring-4 ring-white ${STATE_DOT[item.state]}`} />
        {!isLast && <span className="mt-1 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-col gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Link to={hrefOf(item)} className="min-w-0 sm:flex-1">
            <p className={`font-medium sm:truncate ${item.state === 'missed' ? 'text-muted' : ''}`}>{item.name}</p>
            <p className="truncate text-sm text-muted">{courseLine(detailsOf(item)) || (item.due || item.session?.classId ? t('Semester class') : t('One-off'))}</p>
          </Link>
          <div className="shrink-0">
            {item.state === 'active' && s ? (
              <span className="flex items-center gap-3">
                <span className="hidden sm:block"><LiveCount session={s} /></span>
                <Link to={hrefOf(item)} className={`${buttonClass()} ${small}`}>{t('Show QR')}</Link>
              </span>
            ) : item.state === 'ended' && s ? (
              <Link to={hrefOf(item)} className="tabular text-sm hover:underline">
                <span className="font-semibold">
                  {s.presentCount}
                  {s.expected ? ` / ${s.expected}` : ''}
                </span>
                <span className="ml-2 text-muted">{s.expected ? formatPercent(percent(s.presentCount, s.expected)) : t('Present')}</span>
              </Link>
            ) : startable ? (
              <Button variant="secondary" busy={busy} onClick={start} className={small}>
                {t('Start')}
              </Button>
            ) : (
              <span className="text-sm text-muted">{t('Not held')}</span>
            )}
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </li>
  )
}

/** Today in time order, as a timeline. */
export function TodaySchedule({ items }: { items: AgendaItem[] }) {
  return (
    <Card className="p-4 pb-1 sm:p-5 sm:pb-2">
      <h2 className="mb-2 text-sm font-semibold">{t('Today’s schedule')}</h2>
      <ol>
        {items.map((item, i) => (
          <ScheduleRow key={item.key} item={item} isLast={i === items.length - 1} />
        ))}
      </ol>
    </Card>
  )
}
