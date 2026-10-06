import { useState } from 'react'
import { cancelRange, restoreReason } from '../data/classes'
import { formatDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Session, WeeklyClass } from '../lib/types'
import { Button, Card, ErrorNote, friendlyError, inputClass } from './ui'

/**
 * Public holidays and semester breaks for a lecturer's whole timetable: no class on those
 * dates, so they are not counted towards the semester total or anyone's attendance.
 */
export function Breaks({ classes, sessions, start }: { classes: WeeklyClass[]; sessions: Session[]; start: string }) {
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(start)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  // What is already called off, grouped by its reason, with the dates it covers.
  const groups = new Map<string, string[]>()
  for (const cls of classes) {
    for (const [key, why] of Object.entries(cls.cancelled ?? {})) groups.set(why, [...(groups.get(why) ?? []), key.slice(0, 10)])
  }
  const list = [...groups.entries()].map(([why, dates]) => ({ why, count: dates.length, first: dates.sort()[0], last: dates[dates.length - 1] })).sort((a, b) => a.first.localeCompare(b.first))

  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setError('')
    setDone('')
    try {
      setDone(await work())
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  const apply = () =>
    run(async () => {
      // A class that was really held on one of those days stays as it is.
      const held = new Set(sessions.filter((s) => s.status !== 'scheduled').map((s) => s.id))
      const n = await cancelRange(classes, from, to < from ? from : to, reason || t('Holiday'), held)
      return n ? t(n === 1 ? '1 class marked as no class.' : '{n} classes marked as no class.', { n }) : t('No classes fall on those dates.')
    })

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">{t('Holidays and semester breaks')}</h2>
        <p className="text-sm text-muted">{t('No class on these dates, for all your classes. They are not counted in the semester total or in anyone’s attendance.')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] sm:items-end">
        <label className="block text-sm font-medium">
          {t('From')}
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} className={`${inputClass} mt-1 !h-10`} />
        </label>
        <label className="block text-sm font-medium">
          {t('To')}
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1 !h-10`} />
        </label>
        <label className="block text-sm font-medium">
          {t('Reason')}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={60} placeholder={t('e.g. Mid-semester break')} className={`${inputClass} mt-1 !h-10`} />
        </label>
        <Button busy={busy} disabled={!from || !to} onClick={apply}>{t('Mark as no class')}</Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {done && <p className="rounded-lg bg-good-soft px-4 py-2.5 text-sm text-good">{done}</p>}
      {list.length > 0 && (
        <ul className="divide-y divide-line border-t border-line text-sm">
          {list.map((g) => (
            <li key={g.why} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-medium">{g.why === '-' ? t('No reason given') : g.why}</span>
                <span className="ml-2 text-muted">
                  {g.first === g.last ? formatDate(g.first) : `${formatDate(g.first)} – ${formatDate(g.last)}`} · {t(g.count === 1 ? '{n} class' : '{n} classes', { n: g.count })}
                </span>
              </span>
              <button type="button" disabled={busy} onClick={() => run(async () => { await restoreReason(classes, g.why); return t('Classes put back.') })} className="font-medium text-accent disabled:opacity-50">
                {t('Put back')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
