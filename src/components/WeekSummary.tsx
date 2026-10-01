import { useState } from 'react'
import { Link } from 'react-router-dom'
import { agendaFor } from '../lib/agenda'
import { addDays, dayShort, formatDate, formatPercent, parseDate, percent, weekStart } from '../lib/format'
import { t } from '../lib/i18n'
import type { Session, WeeklyClass } from '../lib/types'
import { DayAgenda, STATE_DOT } from './DayAgenda'
import { Card } from './ui'

/**
 * The week at a glance on the Today screen: seven days with what is on each, and
 * this week's totals. Tapping another day shows that day's list underneath.
 */
export function WeekSummary({ sessions, classes, today }: { sessions: Session[]; classes: WeeklyClass[]; today: string }) {
  const [selected, setSelected] = useState(today)
  const monday = weekStart(today)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return { date, items: agendaFor(date, sessions, classes, today) }
  })
  // A cancelled meeting is not a session any more.
  const all = days.flatMap((d) => d.items).filter((i) => i.state !== 'cancelled')
  const held = all.filter((i) => i.session && i.state !== 'scheduled')
  // The rate only counts finished sessions with a known headcount.
  const counted = held.filter((i) => i.state === 'ended' && i.session!.expected)
  const rate = percent(
    counted.reduce((n, i) => n + i.session!.presentCount, 0),
    counted.reduce((n, i) => n + (i.session!.expected ?? 0), 0),
  )
  const picked = days.find((d) => d.date === selected)

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('This week')}</h2>
        <Link to="/app/calendar" className="text-sm font-medium text-accent hover:underline">
          {t('Full calendar')} ›
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {days.map(({ date, items }) => {
          const isToday = date === today
          const isPicked = date === selected
          return (
            <button
              key={date}
              onClick={() => setSelected(date)}
              aria-pressed={isPicked}
              aria-label={`${formatDate(date)}: ${t('{n} sessions', { n: items.length })}`}
              className={`flex flex-col items-center rounded-lg py-2 transition-colors ${isPicked ? 'bg-accent-soft ring-1 ring-indigo-200 ring-inset' : 'hover:bg-slate-50'}`}
            >
              <span className="text-[11px] font-medium text-muted">{dayShort(parseDate(date).getDay())}</span>
              <span
                className={`tabular mt-1 flex size-8 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-accent text-white' : ''}`}
              >
                {parseDate(date).getDate()}
              </span>
              <span className="mt-1.5 flex h-2 items-center gap-0.5">
                {items.slice(0, 4).map((item) => (
                  <span key={item.key} className={`size-1.5 rounded-full ${STATE_DOT[item.state]}`} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
        {[
          [t('Sessions'), all.length],
          [t('Held'), held.length],
          [t('Attendance'), formatPercent(rate)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="tabular text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Today's own sessions are the big cards below; other days are listed here. */}
      {picked && selected !== today && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">{formatDate(selected)}</p>
          <DayAgenda items={picked.items} empty={t('Nothing on this day.')} />
        </div>
      )}
    </Card>
  )
}
