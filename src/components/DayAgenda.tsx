import { Link } from 'react-router-dom'
import type { AgendaItem } from '../lib/agenda'
import { formatPercent, formatRange, percent, headcount } from '../lib/format'
import { t } from '../lib/i18n'
import { MeetingActions } from './MeetingActions'

export const STATE_DOT: Record<AgendaItem['state'], string> = {
  active: 'bg-good',
  ended: 'bg-accent',
  scheduled: 'bg-slate-400',
  planned: 'bg-slate-400',
  missed: 'bg-slate-200',
  cancelled: 'bg-bad',
}

const STATE_TEXT: Record<AgendaItem['state'], string> = {
  active: 'Session Active',
  ended: 'Ended',
  scheduled: 'Not started',
  planned: 'Scheduled',
  missed: 'Not held',
  cancelled: 'Cancelled',
}

/** Where tapping an item goes: its session if there is one, otherwise the class. */
const href = (item: AgendaItem) => (item.session ? `/app/session/${item.session.id}` : `/app/timetable/${item.due!.cls.id}`)

/** The list of what is on a given day, used under both calendars. */
export function DayAgenda({ items, empty }: { items: AgendaItem[]; empty: string }) {
  if (items.length === 0) return <p className="rounded-lg bg-canvas px-4 py-5 text-center text-sm text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg bg-white shadow-card">
      {items.map((item) => {
        const s = item.session
        // A running session's final count is not stored yet, so only finished ones show numbers.
        const held = s && item.state === 'ended'
        return (
          <li key={item.key} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <Link to={href(item)} className="flex min-w-0 flex-1 items-center gap-3">
              <span className={`size-2 shrink-0 rounded-full ${STATE_DOT[item.state]}`} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${item.state === 'missed' ? 'text-muted' : ''} ${item.state === 'cancelled' ? 'text-muted line-through' : ''}`}>{item.name}</span>
                <span className="block truncate text-sm text-muted">
                  {formatRange(item)}
                  {item.state === 'cancelled' && item.reason && item.reason !== '-' ? ` · ${item.reason}` : ''}
                </span>
              </span>
              <span className="tabular shrink-0 text-right text-sm">
                {held ? (
                  <>
                    <span className="font-semibold">
                      {s.presentCount}
                      {headcount(s.presentCount, s.expected) ? ` / ${s.expected}` : ''}
                    </span>
                    {headcount(s.presentCount, s.expected) ? <span className="ml-2 text-muted">{formatPercent(percent(s.presentCount, s.expected))}</span> : null}
                  </>
                ) : (
                  <span className={item.state === 'active' ? 'font-medium text-good' : item.state === 'cancelled' ? 'font-medium text-bad' : 'text-muted'}>{t(STATE_TEXT[item.state])}</span>
                )}
              </span>
            </Link>
            <MeetingActions item={item} />
          </li>
        )
      })}
    </ul>
  )
}
