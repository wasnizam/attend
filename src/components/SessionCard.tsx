import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { startClassSession } from '../data/classes'
import { startSession } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { usePresentCount } from '../hooks/useSessions'
import { courseLine, effectiveStatus, formatDate, formatPercent, formatRange, headcount, percent } from '../lib/format'
import { t } from '../lib/i18n'
import { rotatePref } from '../lib/prefs'
import type { CourseDetails, Session, Slot, WeeklyClass } from '../lib/types'
import { Button, Card, ErrorNote, StatusBadge, buttonClass, friendlyError } from './ui'

/** "Online" / "Hybrid" tag and a button to open the meeting, for classes not held in a room. */
export function RemoteLine({ item }: { item: CourseDetails }) {
  if (!item.delivery || item.delivery === 'in_person') return null
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
        {t(item.delivery === 'online' ? 'Online' : 'Hybrid')}
      </span>
      {item.meetingUrl && (
        <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
          {t('Open meeting')} ↗
        </a>
      )}
    </p>
  )
}

export function PresentLine({ present, expected }: { present: number; expected: number | null }) {
  const total = headcount(present, expected)
  const pct = percent(present, total)
  return (
    <p className="tabular text-sm text-muted">
      <span className="text-2xl font-semibold tracking-tight text-ink">
        {present}
        {total ? ` / ${total}` : ''}
      </span>{' '}
      {t('Present')}{pct !== null && <span> · {formatPercent(pct)}</span>}
    </p>
  )
}

/** The big card on the Today screen. Its primary button is always the next thing to do. */
export function SessionCard({ session, showDate = false }: { session: Session; showDate?: boolean }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const status = effectiveStatus(session)
  const present = usePresentCount(session, profile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const href = `/app/session/${session.id}`

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      await startSession(session, rotatePref())
      navigate(href)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={href} className="block truncate text-lg font-semibold tracking-tight hover:underline">
            {session.name}
          </Link>
          <p className="mt-0.5 text-sm text-muted">
            {showDate && `${formatDate(session.date)} · `}
            {formatRange(session)}
          </p>
          {courseLine(session) && <p className="truncate text-sm text-muted">{courseLine(session)}</p>}
          <RemoteLine item={session} />
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-4">
        {status === 'scheduled' ? (
          <p className="text-sm text-muted">
            {session.expected ? t('{n} expected', { n: session.expected }) : t('Ready when you are')}
          </p>
        ) : (
          <PresentLine present={present} expected={session.expected} />
        )}
      </div>

      <div className="mt-5 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        {status === 'scheduled' && (
          <Button size="lg" block busy={busy} onClick={start}>
            {t('Start Attendance')}
          </Button>
        )}
        {status === 'active' && (
          <Link to={href} className={buttonClass({ size: 'lg', block: true })}>
            {t('Show QR')}
          </Link>
        )}
        {status === 'ended' && (
          <Link to={href} className={buttonClass({ variant: 'secondary', block: true })}>
            {t('View attendance')}
          </Link>
        )}
      </div>
    </Card>
  )
}

/**
 * A timetable class meeting that is due today but has not been started yet. Starting it
 * creates today's session and opens attendance in one tap.
 */
export function ClassCard({ cls, slot, date }: { cls: WeeklyClass; slot: Slot; date: string }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      navigate(`/app/session/${await startClassSession(profile, cls, date, slot, rotatePref())}`)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/app/timetable/${cls.id}`} className="block truncate text-lg font-semibold tracking-tight hover:underline">
            {cls.name}
          </Link>
          <p className="mt-0.5 text-sm text-muted">{formatRange(slot)}</p>
          {courseLine(cls) && <p className="truncate text-sm text-muted">{courseLine(cls)}</p>}
          <RemoteLine item={cls} />
        </div>
        <StatusBadge status="scheduled" />
      </div>
      <p className="mt-4 text-sm text-muted">
        {cls.rosterCount
          ? t('{n} students on the list', { n: cls.rosterCount })
          : cls.expected
            ? t('{n} expected', { n: cls.expected })
            : t('Ready when you are')}
      </p>
      <div className="mt-5 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <Button size="lg" block busy={busy} onClick={start}>
          {t('Start Attendance')}
        </Button>
      </div>
    </Card>
  )
}
