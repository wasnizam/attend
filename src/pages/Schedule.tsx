import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorNote, PageLoader, friendlyError, inputClass } from '../components/ui'
import { fetchPlans, savePlan, subscribePlan } from '../data/plans'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
import { useLive } from '../hooks/useLive'
import { useRoster } from '../hooks/useRoster'
import { addDays, classSlots, formatTime, inSemester, isoDate, parseDate, weekStart } from '../lib/format'
import { locale, t } from '../lib/i18n'
import type { ShiftPlan, WeeklyClass } from '../lib/types'

type Cells = ShiftPlan['cells']

// One fixed colour per shift, in the order the shifts are listed. Never reused for status.
const TINT = ['bg-indigo-100 text-indigo-900', 'bg-amber-100 text-amber-900', 'bg-teal-100 text-teal-900', 'bg-rose-100 text-rose-900', 'bg-sky-100 text-sky-900', 'bg-lime-100 text-lime-900']

/** Plan who works which shift, one week at a time, for the people on one staff list. */
export function Schedule() {
  const classes = useMyClasses()
  const [listId, setListId] = useState('')
  if (classes.loading) return <PageLoader />
  // A plan belongs to a staff list: the shift that keeps the list, plus the shifts sharing it.
  const lists = (classes.data ?? []).filter((c) => !c.rosterFrom && (c.rosterCount ?? 0) > 0)
  const list = lists.find((c) => c.id === listId) ?? lists[0]
  if (!list) {
    return (
      <EmptyState
        title={t('Add your staff first')}
        text={t('A shift plan needs a shift with a staff list. Add a shift, upload its list, then come back.')}
        action={<Link to="/app/timetable" className="font-medium text-accent">{t('Timetable')} ›</Link>}
      />
    )
  }
  const shifts = [list, ...(classes.data ?? []).filter((c) => c.rosterFrom === list.id)]
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Shift plan')}</h1>
        <p className="text-sm text-muted">{t('Put each person on a shift for each day. Attendance is then checked against this plan.')}</p>
      </div>
      {lists.length > 1 && (
        <label className="block max-w-xs text-xs font-medium text-muted">
          {t('Staff list')}
          <select value={list.id} onChange={(e) => setListId(e.target.value)} className={`${inputClass} mt-1`}>
            {lists.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      <Planner key={list.id} list={list} shifts={shifts} />
    </div>
  )
}

function Planner({ list, shifts }: { list: WeeklyClass; shifts: WeeklyClass[] }) {
  const profile = useProfile()
  const roster = useRoster(list.id, list.organisationId)
  const [week, setWeek] = useState(weekStart(isoDate()))
  const saved = useLive<ShiftPlan | null>((onData, onError) => subscribePlan(list.id, week, profile, onData, onError), [list.id, week, profile.id, profile.role])
  const [cells, setCells] = useState<Cells>({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Show what is stored, unless the manager is in the middle of changing it.
  useEffect(() => {
    if (!dirty && !saved.loading) setCells(saved.data?.cells ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.data, saved.loading, week])

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week])
  // The shifts that actually run on a date: the only ones that can be chosen for it.
  const running = (date: string) => shifts.filter((c) => inSemester(c, date) && !c.cancelled?.[date] && classSlots(c).some((slot) => slot.day === parseDate(date).getDay()))
  const options = useMemo(() => dates.map(running), [dates, shifts]) // eslint-disable-line react-hooks/exhaustive-deps
  const people = roster.data ?? []
  const departments = [...new Set(people.map((p) => p.department ?? ''))].sort()

  const change = (fn: (next: Cells) => void) => {
    setCells((cur) => {
      const next: Cells = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, { ...v }]))
      fn(next)
      return next
    })
    setDirty(true)
  }
  const put = (next: Cells, key: string, date: string, value: string) => {
    next[key] ??= {}
    if (value) next[key][date] = value
    else delete next[key][date]
  }
  /** Puts people on one shift for every day it runs this week (or gives them the week off). */
  const fill = (keys: string[], value: string) =>
    change((next) => {
      for (const key of keys) {
        dates.forEach((date, i) => {
          if (value === 'off' || value === '') put(next, key, date, value)
          else if (options[i].some((c) => c.id === value)) put(next, key, date, value)
        })
      }
    })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    run(async () => {
      await savePlan(list, week, cells)
      setDirty(false)
    })
  const copyLast = () =>
    run(async () => {
      const [last] = await fetchPlans(list.id, [addDays(week, -7)], profile)
      if (!last) throw new Error(t('Last week has no plan to copy.'))
      change((next) => {
        for (const [key, days] of Object.entries(last.cells)) {
          for (const [date, value] of Object.entries(days)) {
            const here = addDays(date, 7)
            const i = dates.indexOf(here)
            if (i >= 0 && (value === 'off' || options[i].some((c) => c.id === value))) put(next, key, here, value)
          }
        }
      })
    })
  const move = (days: number) => {
    if (dirty && !window.confirm(t('Leave this week without saving the changes?'))) return
    setDirty(false)
    setWeek(addDays(week, days))
  }

  if (roster.loading || saved.loading) return <PageLoader />
  const tint = (id: string) => TINT[shifts.findIndex((c) => c.id === id) % TINT.length]
  const count = (date: string, id: string) => people.filter((p) => cells[p.studentKey]?.[date] === id).length
  const fillSelect = (keys: string[], label: string) => (
    <select value="" aria-label={label} onChange={(e) => e.target.value && fill(keys, e.target.value === 'clear' ? '' : e.target.value)} className="h-8 rounded-md border border-line bg-white px-1.5 text-xs font-normal">
      <option value="">{t('Whole week…')}</option>
      {shifts.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      <option value="off">{t('Off')}</option>
      <option value="clear">{t('Clear')}</option>
    </select>
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => move(-7)} aria-label={t('Previous week')} className="size-9 rounded-md bg-white shadow-card hover:bg-canvas">‹</button>
          <p className="tabular min-w-44 px-2 text-center text-sm font-semibold">
            {parseDate(week).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} – {parseDate(dates[6]).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <button onClick={() => move(7)} aria-label={t('Next week')} className="size-9 rounded-md bg-white shadow-card hover:bg-canvas">›</button>
          {week !== weekStart(isoDate()) && (
            <button onClick={() => move(Math.round((parseDate(weekStart(isoDate())).getTime() - parseDate(week).getTime()) / 86_400_000))} className="ml-1 px-2 text-sm font-medium text-accent">
              {t('This week')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={copyLast}>{t('Copy last week')}</Button>
          <Button busy={busy} disabled={!dirty} onClick={save}>{dirty ? t('Save plan') : t('Saved')}</Button>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {shifts.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${tint(c.id)}`}>{c.name}</span>
            <span className="tabular text-muted">{formatTime(classSlots(c)[0].startTime)} – {formatTime(classSlots(c)[0].endTime)}</span>
          </li>
        ))}
      </ul>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-xs text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 py-2.5 pr-2 pl-4 font-medium">{t('Name')}</th>
              {dates.map((date) => (
                <th key={date} className={`px-1 py-2.5 text-center font-medium ${date === isoDate() ? 'text-accent' : ''}`}>
                  <span className="block capitalize">{parseDate(date).toLocaleDateString(locale(), { weekday: 'short' })}</span>
                  <span className="tabular block text-ink">{parseDate(date).getDate()}</span>
                </th>
              ))}
              <th className="px-2 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => {
              const group = people.filter((p) => (p.department ?? '') === dept)
              return [
                departments.length > 1 || dept ? (
                  <tr key={`d-${dept}`} className="bg-slate-50/70 text-xs font-semibold">
                    <td className="sticky left-0 z-10 bg-slate-50 py-2 pr-2 pl-4" colSpan={8}>
                      {dept || t('No department')} <span className="font-normal text-muted">· {group.length}</span>
                    </td>
                    <td className="px-2 py-1.5">{fillSelect(group.map((p) => p.studentKey), t('Whole week for this department'))}</td>
                  </tr>
                ) : null,
                ...group.map((p) => (
                  <tr key={p.studentKey}>
                    <td className="sticky left-0 z-10 border-t border-line bg-white py-1.5 pr-2 pl-4">
                      <span className="block max-w-40 truncate font-medium">{p.studentName}</span>
                      <span className="tabular block text-xs text-muted">{p.studentId}</span>
                    </td>
                    {dates.map((date, i) => {
                      const value = cells[p.studentKey]?.[date] ?? ''
                      return (
                        <td key={date} className="border-t border-line px-1 py-1.5">
                          <select
                            value={value}
                            aria-label={`${p.studentName}, ${date}`}
                            onChange={(e) => change((next) => put(next, p.studentKey, date, e.target.value))}
                            className={`h-9 w-full min-w-20 rounded-md px-1 text-xs font-semibold ${value === 'off' ? 'bg-slate-100 text-slate-500' : value ? tint(value) : 'border border-dashed border-line bg-white font-normal text-muted'}`}
                          >
                            <option value="">—</option>
                            {options[i].map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                            {/* A shift that no longer runs on this day stays visible until it is changed. */}
                            {value && value !== 'off' && !options[i].some((c) => c.id === value) && <option value={value}>{shifts.find((c) => c.id === value)?.name ?? '?'}</option>}
                            <option value="off">{t('Off')}</option>
                          </select>
                        </td>
                      )
                    })}
                    <td className="border-t border-line px-2 py-1.5">{fillSelect([p.studentKey], t('Whole week for {name}', { name: p.studentName }))}</td>
                  </tr>
                )),
              ]
            })}
          </tbody>
          <tfoot className="text-xs">
            {shifts.map((c) => (
              <tr key={c.id}>
                <td className="sticky left-0 z-10 border-t border-line bg-slate-50 py-2 pr-2 pl-4 font-medium">
                  {c.name}
                  {c.minStaff ? <span className="font-normal text-muted"> · {t('needs {n}', { n: c.minStaff })}</span> : null}
                </td>
                {dates.map((date, i) => {
                  const on = options[i].some((x) => x.id === c.id)
                  const n = count(date, c.id)
                  return (
                    <td key={date} className={`tabular border-t border-line bg-slate-50 px-1 py-2 text-center font-semibold ${on && c.minStaff && n < c.minStaff ? 'text-bad' : ''}`}>
                      {on ? n : '·'}
                    </td>
                  )
                })}
                <td className="border-t border-line bg-slate-50" />
              </tr>
            ))}
          </tfoot>
        </table>
      </Card>
      <p className="text-sm text-muted">
        {t('“—” means not planned: that day is not checked. “Off” is a rest day. A red number is a shift with fewer people than it needs.')}
      </p>
    </>
  )
}
