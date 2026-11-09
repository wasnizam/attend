import { useEffect, useState } from 'react'
import { PublicHolidays } from '../components/PublicHolidays'
import { Breaks } from '../components/Breaks'
import { DayAgenda, STATE_DOT } from '../components/DayAgenda'
import { Button, Card, ErrorNote, PageLoader, friendlyError } from '../components/ui'
import { cancelMeeting } from '../data/classes'
import { has } from '../lib/purpose'
import { useMyClasses } from '../hooks/useClasses'
import { useMySessions, useNow } from '../hooks/useSessions'
import { agendaFor } from '../lib/agenda'
import { WEEK, addDays, dayShort, formatDate, formatTime, isoDate, parseDate, weekStart } from '../lib/format'
import { type Holiday, getHolidaySetting, holidaysBetween } from '../lib/holidays'
import { locale, t } from '../lib/i18n'

/** A month of sessions and class meetings: what was held, what is running, what is coming. */
/** The public holidays between two dates, by date, for the organisation's country (none if off). */
function useHolidays(from: string, to: string): Map<string, string> {
  const setting = getHolidaySetting()
  const key = `${setting?.country ?? ''}|${setting?.region ?? ''}|${from}|${to}`
  const [found, setFound] = useState<{ key: string; list: Holiday[] }>({ key: '', list: [] })
  useEffect(() => {
    if (!setting) return
    let stale = false
    holidaysBetween(setting, from, to).then((list) => !stale && setFound({ key, list }), () => {})
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return new Map(found.key === key ? found.list.map((h) => [h.date, h.name]) : [])
}

export function Calendar() {
  const sessions = useMySessions()
  const classes = useMyClasses()
  useNow(60_000)
  const today = isoDate()
  // Any date inside the month being shown.
  const [month, setMonth] = useState(today.slice(0, 7) + '-01')
  const [selected, setSelected] = useState(today)
  // Public holidays on the grid; the picked day's too, should it lie outside the grid.
  const gridStart = weekStart(month)
  const holidays = useHolidays(gridStart < selected ? gridStart : selected, addDays(gridStart, 41) > selected ? addDays(gridStart, 41) : selected)

  if (sessions.loading || classes.loading) return <PageLoader />
  if (sessions.error || classes.error) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>

  const first = parseDate(month)
  const shift = (by: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + by, 1)
    setMonth(isoDate(d))
  }
  // Six rows always, so the grid does not jump in height between months.
  const start = weekStart(month)
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i)
    return { date, inMonth: date.slice(0, 7) === month.slice(0, 7), items: agendaFor(date, sessions.data ?? [], classes.data ?? [], today) }
  })
  const picked = days.find((d) => d.date === selected)

  const dayItems = picked?.items ?? agendaFor(selected, sessions.data ?? [], classes.data ?? [], today)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{t('Sessions and classes by date')}</p>
          <h1 className="text-2xl font-semibold tracking-tight capitalize sm:text-3xl">
            {first.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" aria-label={t('Previous month')} onClick={() => shift(-1)}>‹</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setMonth(today.slice(0, 7) + '-01')
              setSelected(today)
            }}
          >
            {t('Today')}
          </Button>
          <Button variant="secondary" aria-label={t('Next month')} onClick={() => shift(1)}>›</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-slate-50 text-center text-xs font-medium text-muted">
          {WEEK.map((d) => (
            <div key={d} className="py-2">{dayShort(d)}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(({ date, inMonth, items }, i) => {
            const isToday = date === today
            const isPicked = date === selected
            const holiday = holidays.get(date)
            return (
              <button
                key={date}
                onClick={() => setSelected(date)}
                aria-pressed={isPicked}
                aria-label={`${formatDate(date)}${holiday ? ` · ${holiday}` : ''}: ${t('{n} sessions', { n: items.length })}`}
                className={`flex min-h-16 flex-col items-stretch gap-1 border-line p-1 text-left transition-colors sm:min-h-28 sm:p-1.5 ${i % 7 ? 'border-l' : ''} ${i >= 7 ? 'border-t' : ''} ${
                  isPicked ? 'bg-accent-soft' : holiday ? (inMonth ? 'bg-orange-50 hover:bg-orange-100' : 'bg-orange-50/50') : 'hover:bg-slate-50'
                } ${inMonth ? '' : `${holiday ? '' : 'bg-slate-50/60'} text-slate-400`} ${isPicked && holiday ? 'shadow-[inset_0_0_0_2px_rgb(251,146,60)]' : ''}`}
              >
                <span
                  className={`tabular flex size-6 items-center justify-center self-center rounded-full text-xs font-semibold sm:self-start ${isToday ? 'bg-accent text-white' : holiday && inMonth ? 'text-orange-700' : ''}`}
                >
                  {parseDate(date).getDate()}
                </span>
                {holiday && (
                  <>
                    {/* Phone: a short orange bar. Wider screens: the holiday's name. */}
                    <span className="mx-auto h-1 w-5 rounded-full bg-orange-400 sm:hidden" />
                    <span className={`hidden truncate px-1 text-[11px] leading-4 font-semibold sm:block ${inMonth ? 'text-orange-700' : 'text-orange-400'}`} title={holiday}>
                      {holiday}
                    </span>
                  </>
                )}
                {/* Phone: dots. Wider screens: the first few sessions by name. */}
                <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                  {items.slice(0, 4).map((item) => (
                    <span key={item.key} className={`size-1.5 rounded-full ${STATE_DOT[item.state]}`} />
                  ))}
                </span>
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {items.slice(0, 3).map((item) => (
                    <span key={item.key} className={`flex items-center gap-1 truncate rounded px-1 text-[11px] leading-5 ${item.state === 'missed' ? 'text-slate-400' : item.state === 'cancelled' ? 'text-slate-400 line-through' : 'bg-white text-ink shadow-card'}`}>
                      <span className={`size-1.5 shrink-0 rounded-full ${STATE_DOT[item.state]}`} />
                      <span className="tabular shrink-0 text-muted">{formatTime(item.startTime).replace(':00', '').replace(' ', '').toLowerCase()}</span>
                      <span className="truncate">{item.name}</span>
                    </span>
                  ))}
                  {items.length > 3 && <span className="px-1 text-[11px] text-muted">{t('+{n} more', { n: items.length - 3 })}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {([['active', 'Session Active'], ['ended', 'Held'], ['planned', 'Scheduled'], ['missed', 'Not held'], ['cancelled', 'Cancelled']] as const).map(([state, label]) => (
          <span key={state} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${STATE_DOT[state]}`} />
            {t(label)}
          </span>
        ))}
        {getHolidaySetting() && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-orange-300 bg-orange-50" />
            {t('Public holiday')}
          </span>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">
          {formatDate(selected)}
          {selected === today && <span className="ml-2 text-sm font-normal text-muted">{t('Today')}</span>}
        </h2>
        {holidays.get(selected) && (
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700 ring-1 ring-orange-200">
            <span className="size-2 rounded-full bg-orange-400" />
            {t('Public holiday')}: {holidays.get(selected)}
          </p>
        )}
        <DayAgenda items={dayItems} empty={t('Nothing on this day.')} />
        {has('clock') && dayItems.some((i) => i.due && (i.state === 'planned' || i.state === 'missed')) && (
          // A public holiday closes every office at once.
          <button
            onClick={async () => {
              const reason = window.prompt(t('Give everyone the day off on {date}? Type the reason, for example the name of the public holiday.', { date: formatDate(selected) }), t('Public holiday'))
              if (reason === null) return
              try {
                for (const i of dayItems) if (i.due && (i.state === 'planned' || i.state === 'missed')) await cancelMeeting(i.due.cls, i.date, i.due.slot, reason)
              } catch (e) {
                window.alert(friendlyError(e))
              }
            }}
            className="mt-3 text-sm font-semibold text-accent hover:underline"
          >
            {t('Day off for everyone (public holiday)')}
          </button>
        )}
      </section>

      {/* Public holidays by country, for every class and shift. */}
      {(classes.data ?? []).length > 0 && <PublicHolidays />}

      {/* Lecturers and trainers: holidays and breaks for the whole timetable at once. */}
      {has('recurring') && !has('clock') && (classes.data ?? []).length > 0 && <Breaks classes={classes.data ?? []} sessions={sessions.data ?? []} start={selected} />}
    </div>
  )
}
