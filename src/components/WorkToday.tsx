import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { type ClockOuts, subscribeClockOuts } from '../data/attendance'
import { startClassSession } from '../data/classes'
import { startSession } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { useAbsentees } from '../hooks/useRoster'
import { useSessionAttendance } from '../hooks/useSessions'
import type { AgendaItem } from '../lib/agenda'
import { countedMinutes, endOf, formatClock, formatDuration, formatRange, isAway, minutesLate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Session } from '../lib/types'
import { Button, Card, ErrorNote, Spinner, friendlyError } from './ui'

/**
 * A workplace's day, about people rather than sessions: for each set of working hours today,
 * who is in, who is late, who has left and who has not come.
 */
export function WorkToday({ items, now }: { items: AgendaItem[]; now: number }) {
  if (items.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-lg font-semibold tracking-tight">{t('No working hours today')}</p>
        <p className="mt-1 text-sm text-muted">{t('Today is not a working day. Nothing to do here.')}</p>
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (item.session ? <Day key={item.key} item={item} session={item.session} now={now} /> : <NotOpen key={item.key} item={item} now={now} />))}
    </div>
  )
}

function Head({ item, chip, tone }: { item: AgendaItem; chip: string; tone: 'good' | 'muted' | 'warn' }) {
  const tones = { good: 'bg-good-soft text-good', muted: 'bg-slate-100 text-slate-600', warn: 'bg-[#fff4d6] text-[#8a5a00]' }
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold tracking-tight">{item.name}</h2>
        <p className="tabular text-sm text-muted">{formatRange(item)}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{chip}</span>
    </div>
  )
}

/** Working hours that have not been opened today (yet, or at all). */
function NotOpen({ item, now }: { item: AgendaItem; now: number }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cls = item.due?.cls
  const over = now > endOf(item).getTime()
  if (item.state === 'cancelled') {
    return (
      <Card className="p-5">
        <Head item={item} chip={t('Not working today')} tone="muted" />
        {item.reason && <p className="mt-2 text-sm text-muted">{item.reason}</p>}
      </Card>
    )
  }
  const open = async () => {
    setBusy(true)
    setError('')
    try {
      // Opened by hand: always with the changing code, as on the door screen.
      if (item.session) {
        await startSession(item.session, true)
        navigate(`/app/session/${item.session.id}`)
      } else navigate(`/app/session/${await startClassSession(profile, cls!, item.date, item.due!.slot, true)}`)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }
  return (
    <Card className="p-5">
      <Head item={item} chip={over ? t('Was not opened') : t('Not open yet')} tone={over ? 'warn' : 'muted'} />
      <p className="mt-3 text-sm text-slate-600">
        {over
          ? t('Nobody could clock in today because the door screen was not open. You can still open it now and add people by hand.')
          : cls?.rosterCount
            ? t(cls.rosterCount === 1 ? 'It opens by itself on the door screen, 30 minutes before the start. 1 person is expected.' : 'It opens by itself on the door screen, 30 minutes before the start. {n} people are expected.', { n: cls.rosterCount })
            : t('It opens by itself on the door screen, 30 minutes before the start.')}
      </p>
      {cls && !cls.rosterCount && !cls.rosterFrom && (
        <p className="mt-2 text-sm">
          <Link to={`/app/timetable/${cls.id}/students`} className="font-semibold text-accent">{t('Add its staff list')} ›</Link>{' '}
          <span className="text-muted">{t('Without one, anyone with the QR can clock in under any name.')}</span>
        </p>
      )}
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/app/door" className="inline-flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:opacity-90">{t('Open door screen')}</Link>
        <Button variant="secondary" busy={busy} onClick={open}>{t('Open here instead')}</Button>
      </div>
    </Card>
  )
}

/** One opened day: the figures a manager looks for, then the names behind them. */
function Day({ item, session, now }: { item: AgendaItem; session: Session; now: number }) {
  const profile = useProfile()
  const records = useSessionAttendance(session, profile)
  const outs = useLive<ClockOuts>((onData, onError) => subscribeClockOuts(session, profile, onData, onError), [session.id, profile.id, profile.role])
  const missing = useAbsentees(session, records.data ?? [])
  const closed = item.state !== 'active'

  if (!records.data || !outs.data) {
    return (
      <Card className="p-5">
        <Head item={item} chip={closed ? t('Closed') : t('Open')} tone={closed ? 'muted' : 'good'} />
        <div className="mt-4"><Spinner /></div>
      </Card>
    )
  }
  const came = records.data.filter((r) => !isAway(r.status))
  const away = records.data.filter((r) => isAway(r.status))
  const left = came.filter((r) => outs.data!.has(r.studentKey))
  const inNow = came.filter((r) => !outs.data!.has(r.studentKey))
  const late = came.map((r) => ({ r, by: r.method === 'manual' ? 0 : minutesLate(r.timestamp, session) })).filter((x) => x.by > 0 || x.r.status === 'late')
  // The same phone label on more than one person today.
  const phones = new Map<string, number>()
  for (const r of came) if (r.device && !r.phoneChecked) phones.set(r.device, (phones.get(r.device) ?? 0) + 1)
  const shared = [...phones.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0)
  const figures: [string, number, string][] = [
    [closed ? t('Did not clock out') : t('In now'), inNow.length, closed && inNow.length ? 'text-[#b25e00]' : 'text-ink'],
    [t('Late'), late.length, late.length ? 'text-[#b25e00]' : 'text-ink'],
    [t('Left'), left.length, 'text-ink'],
    [closed ? t('Absent') : t('Not in yet'), missing.length, missing.length ? 'text-bad' : 'text-ink'],
    [t('On leave or MC'), away.length, 'text-ink'],
  ]

  return (
    <Card className="p-5">
      <Head item={item} chip={closed ? t('Closed') : t('Open')} tone={closed ? 'muted' : 'good'} />
      <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {figures.map(([label, value, tone]) => (
          <div key={label} className="rounded-lg bg-canvas px-3 py-2.5">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`tabular text-2xl font-semibold tracking-tight ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {shared > 0 && (
        <p className="mt-3 rounded-lg bg-[#fff4d6] px-3 py-2 text-sm text-[#8a5a00]">
          {t('{n} people clocked in from the same phone.', { n: shared })}{' '}
          <Link to={`/app/session/${session.id}`} className="font-semibold underline">{t('See who')}</Link>
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Names
          title={closed ? t('Absent') : t('Not in yet')}
          empty={session.rosterId ? t('Everyone is accounted for.') : t('Add a staff list to see who has not come.')}
          rows={missing.map((m) => ({ key: m.studentId, name: m.studentName, note: '' }))}
        />
        <Names
          title={t('Late')}
          empty={t('Nobody is late.')}
          rows={late.map(({ r, by }) => ({ key: r.id, name: r.studentName, note: by ? t('Late by {n} min', { n: by }) : formatClock(r.timestamp) }))}
        />
      </div>
      {came.length > 0 && (
        <details className="mt-4 rounded-lg bg-canvas">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">{t('Everyone who came')} · {came.length}</summary>
          <ul className="divide-y divide-line px-4 pb-2 text-sm">
            {came.map((r) => {
              const out = outs.data!.get(r.studentKey)
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{r.studentName}</span>
                  <span className="tabular shrink-0 text-muted">
                    {formatClock(r.timestamp)}
                    {out ? ` – ${formatClock(new Date(out.toMillis()))} · ${formatDuration(countedMinutes(r.timestamp?.toMillis() ?? out.toMillis(), out.toMillis(), session))}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </details>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Link to={`/app/session/${session.id}`} className="font-semibold text-accent">{t('Correct or add someone')} ›</Link>
        {now > endOf(session).getTime() && !closed && <span className="text-muted">{t('Still open so people can clock out. It closes by itself.')}</span>}
      </div>
    </Card>
  )
}

function Names({ title, rows, empty }: { title: string; rows: { key: string; name: string; note: string }[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-sm">
          {rows.slice(0, 8).map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{r.name}</span>
              {r.note && <span className="tabular shrink-0 text-xs text-[#b25e00]">{r.note}</span>}
            </li>
          ))}
          {rows.length > 8 && <li className="text-muted">{t('and {n} more', { n: rows.length - 8 })}</li>}
        </ul>
      )}
    </div>
  )
}
