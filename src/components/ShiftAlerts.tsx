import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type ClockOuts, clockOutFor, subscribeClockOuts } from '../data/attendance'
import { useProfile } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { useSessionAttendance } from '../hooks/useSessions'
import { effectiveStatus, endOf, formatClock, isAway, parseDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Session } from '../lib/types'
import { Card } from './ui'

const HOUR = 3_600_000

/**
 * What a manager would want to be told without looking: a shift that is short of people,
 * and people who went home without clocking out. Shows nothing when all is well.
 */
export function ShiftAlerts({ sessions, now }: { sessions: Session[]; now: number }) {
  // Shifts that have begun and ended no more than a day and a half ago.
  const recent = sessions.filter(
    (s) => s.status !== 'scheduled' && parseDate(s.date, s.startTime).getTime() <= now && endOf(s).getTime() > now - 36 * HOUR,
  )
  if (recent.length === 0) return null
  return (
    <Card className="overflow-hidden [&:not(:has(li))]:hidden">
      <h2 className="px-4 pt-4 text-sm font-semibold sm:px-5">{t('Needs attention')}</h2>
      <ul className="mt-2 divide-y divide-line">
        {recent.map((s) => (
          <ShiftAlert key={s.id} session={s} now={now} />
        ))}
      </ul>
    </Card>
  )
}

function ShiftAlert({ session, now }: { session: Session; now: number }) {
  const profile = useProfile()
  const records = useSessionAttendance(session, profile).data
  const outs = useLive<ClockOuts>((onData, onError) => subscribeClockOuts(session, profile, onData, onError), [session.id, profile.id, profile.role]).data
  const [busy, setBusy] = useState(false)
  if (!records || !outs) return null

  const start = parseDate(session.date, session.startTime).getTime()
  const end = endOf(session)
  const here = records.filter((r) => !isAway(r.status))
  const short =
    effectiveStatus(session, now) === 'active' && session.minStaff && now > start + 15 * 60_000 && now < end.getTime() && here.length < session.minStaff
  // Half an hour after the end, anyone still "in" has most likely forgotten.
  const forgot = now > end.getTime() + HOUR / 2 ? here.filter((r) => !outs.has(r.studentKey)) : []
  if (!short && forgot.length === 0) return null

  const fill = async () => {
    setBusy(true)
    try {
      // Only people who arrived before the shift ended can have left at its end.
      await Promise.all(
        forgot.filter((r) => (r.timestamp?.toMillis() ?? Infinity) < end.getTime()).map((r) => clockOutFor(session, profile, r.studentKey, end)),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {short && (
        <li className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
          <span className="size-2 shrink-0 rounded-full bg-bad" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{session.name}</span>{' '}
            <span className="text-muted">{t('is short of people: {n} of {min} in', { n: here.length, min: session.minStaff ?? 0 })}</span>
          </span>
          <Link to={`/app/session/${session.id}`} className="shrink-0 font-medium text-accent">{t('Open')} ›</Link>
        </li>
      )}
      {forgot.length > 0 && (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:px-5">
          <span className="size-2 shrink-0 rounded-full bg-[#fab219]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{session.name}</span>{' '}
            <span className="text-muted">
              {t('{n} did not clock out', { n: forgot.length })}: {forgot.slice(0, 3).map((r) => r.studentName).join(', ')}
              {forgot.length > 3 ? '…' : ''}
            </span>
          </span>
          <button disabled={busy} onClick={fill} className="shrink-0 rounded-md bg-canvas px-3 py-1.5 font-medium hover:bg-accent-soft disabled:opacity-60">
            {t('Set to {time}', { time: formatClock(end) })}
          </button>
          <Link to={`/app/session/${session.id}`} className="shrink-0 font-medium text-accent">{t('Open')} ›</Link>
        </li>
      )}
    </>
  )
}
