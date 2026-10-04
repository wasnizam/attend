import { useState } from 'react'
import { Link } from 'react-router-dom'
import { setShifts } from '../data/account'
import { useProfile } from '../hooks/useAuth'
import { WEEK, classSlots, dayName, formatRange } from '../lib/format'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import type { WeeklyClass } from '../lib/types'
import { Button, Card, EmptyState, ErrorNote, buttonClass, friendlyError } from './ui'

/**
 * A workplace's working hours (or shifts), one card each: the week at a glance, the rules that
 * apply, and the people on it. Shifts are offered here, where a company would look for them.
 */
export function WorkHours({ classes }: { classes: WeeklyClass[] }) {
  const profile = useProfile()
  const shifts = has('shifts')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lists = new Map(classes.map((c) => [c.id, c]))
  // Grouped by office, so a company with branches sees each branch's hours together.
  const offices = [...new Set(classes.map((c) => c.venue || ''))].sort()

  const turnOn = async () => {
    setBusy(true)
    setError('')
    try {
      await setShifts(profile.organisationId, true)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{shifts ? t('Shifts', undefined, true) : t('Working hours')}</h1>
          <p className="text-sm text-muted">
            {shifts ? t('Each shift, its days and hours, and who works on it.', undefined, true) : t('When people work, and the rules for lateness, breaks and overtime.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shifts && <Link to="/app/plan" className={buttonClass({ variant: 'secondary' })}>{t('Shift plan', undefined, true)}</Link>}
          <Link to="/app/new" className={buttonClass()}>{shifts ? t('+ Add shift', undefined, true) : t('+ Add working hours')}</Link>
        </div>
      </div>

      {classes.length === 0 ? (
        <EmptyState
          title={shifts ? t('No shifts yet', undefined, true) : t('No working hours yet')}
          text={t('Add the days and hours people work. Everything else is worked out from them.')}
          action={<Link to="/app/new" className={buttonClass({ size: 'lg' })}>{shifts ? t('+ Add shift', undefined, true) : t('+ Add working hours')}</Link>}
        />
      ) : (
        offices.map((office) => (
          <section key={office || 'none'} className="space-y-3">
            {offices.length > 1 && <h2 className="text-sm font-semibold text-muted">{office || t('No office set')}</h2>}
            <div className="grid gap-3 md:grid-cols-2">
              {classes.filter((c) => (c.venue || '') === office).map((c) => (
                <HoursCard key={c.id} c={c} shared={c.rosterFrom ? lists.get(c.rosterFrom) : undefined} />
              ))}
            </div>
          </section>
        ))
      )}

      {shifts ? (
        <Card className="p-5">
          <h2 className="font-semibold">{t('How shifts work here', undefined, true)}</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>{t('Add each shift: morning, afternoon, night (a night shift may end the next day).', undefined, true)}</li>
            <li>{t('Keep one staff list on one shift, and let the other shifts share it if people rotate.', undefined, true)}</li>
            <li>{t('Each week, put people on shifts in the Shift plan. Attendance is checked against it.', undefined, true)}</li>
          </ol>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="max-w-xl">
            <h2 className="font-semibold">{t('Do some people work shifts?', undefined, true)}</h2>
            <p className="mt-1 text-sm text-muted">
              {t('Turn on shifts for several shifts a day, night shifts, people who rotate, and a weekly shift plan. Ordinary office hours do not need it.', undefined, true)}
            </p>
            <ErrorNote>{error}</ErrorNote>
          </div>
          {profile.role === 'admin' ? (
            <Button variant="secondary" busy={busy} onClick={turnOn}>{t('Turn on shifts', undefined, true)}</Button>
          ) : (
            <p className="text-sm text-muted">{t('Ask your admin to turn it on.')}</p>
          )}
        </Card>
      )}
    </div>
  )
}

function HoursCard({ c, shared }: { c: WeeklyClass; shared?: WeeklyClass }) {
  const slots = classSlots(c)
  const sameTimes = slots.every((s) => s.startTime === slots[0].startTime && s.endTime === slots[0].endTime)
  const rules = [
    c.flexible ? t('Flexible hours') : t('Late after {n} min', { n: c.graceMin ?? 10 }),
    c.breakMin ? t('{n} min unpaid break', { n: c.breakMin }) : t('No unpaid break'),
    c.geoPoint ? t('Location check on') : null,
    c.rotating ? t('People rotate', undefined, true) : null,
    c.minStaff ? t('Needs {n}', { n: c.minStaff }) : null,
  ].filter(Boolean)
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{c.name}</h3>
          {sameTimes && <p className="tabular text-sm text-muted">{formatRange(slots[0])}</p>}
        </div>
        <Link to={`/app/timetable/${c.id}`} className="shrink-0 text-sm font-semibold text-accent hover:underline">{t('Edit')}</Link>
      </div>
      <div className="mt-3 flex gap-1" aria-label={t('Working days')}>
        {WEEK.map((d) => {
          const day = slots.find((s) => s.day === d)
          return (
            <span
              key={d}
              title={day ? `${dayName(d)} · ${formatRange(day)}` : dayName(d)}
              className={`flex h-9 flex-1 flex-col items-center justify-center rounded-md text-[11px] font-semibold ${day ? 'bg-accent-soft text-accent' : 'bg-canvas text-slate-400'}`}
            >
              {dayName(d).slice(0, 3)}
              {!sameTimes && day && <span className="tabular text-[9px] font-medium">{day.startTime}</span>}
            </span>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted">{rules.join(' · ')}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm">
        <span className="text-muted">
          {shared ? t('Shares the staff list of {name}', { name: shared.name }) : c.rosterCount ? t('{n} staff', { n: c.rosterCount }) : t('No staff list yet')}
        </span>
        <Link to={`/app/timetable/${c.rosterFrom || c.id}/students`} className="font-semibold text-accent hover:underline">
          {c.rosterCount || shared ? t('Staff list') : t('Add staff')} ›
        </Link>
      </div>
    </Card>
  )
}
