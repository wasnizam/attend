import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorNote, PageLoader, inputClass } from '../components/ui'
import { subscribeAwayCounts } from '../data/attendance'
import { useProfile } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { useMySessions, useNow } from '../hooks/useSessions'
import { effectiveStatus, formatDate, formatPercent, headcount, isoDate, percent } from '../lib/format'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'

export function History() {
  const { data, loading, error } = useMySessions()
  const [search, setSearch] = useState('')
  const profile = useProfile()
  // At work, leave and MC are not missed days: the rate is out of the people who were due.
  const work = has('clock')
  const away = useLive<Map<string, number>>(work ? (onData, onError) => subscribeAwayCounts(profile, onData, onError) : null, [work, profile.id, profile.role])
  useNow()
  const today = isoDate()

  if (loading) return <PageLoader />
  if (error) return <ErrorNote>{t('We could not load your history. Check your connection and reload.')}</ErrorNote>

  const past = (data ?? []).filter((s) => effectiveStatus(s) === 'ended' || s.date < today)
  const q = search.trim().toLowerCase()
  const shown = q ? past.filter((s) => s.name.toLowerCase().includes(q)) : past

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('Attendance History')}</h1>
      {past.length === 0 ? (
        <EmptyState title={t('No past sessions yet')} text={t('Sessions appear here once they have ended.')} />
      ) : (
        <>
          {past.length > 6 && (
            <input
              type="search"
              placeholder={t('Search sessions')}
              aria-label={t('Search sessions')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputClass}
            />
          )}
          {shown.length === 0 ? (
            <p className="py-8 text-center text-muted">{t('No sessions match “{q}”.', { q: search })}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-card">
              {shown.map((s) => {
                const total = headcount(s.presentCount, s.expected)
                const off = away.data?.get(s.id) ?? 0
                const pct = percent(s.presentCount, total ? total - off : total)
                const held = s.status !== 'scheduled'
                return (
                  <li key={s.id}>
                    <Link to={`/app/session/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-canvas/60">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{s.name}</p>
                        <p className="text-sm text-muted">{formatDate(s.date)}</p>
                      </div>
                      <div className="tabular shrink-0 text-right">
                        {held ? (
                          <>
                            <p className="font-semibold">
                              {s.presentCount}
                              {total ? ` / ${total}` : ` ${t('present')}`}
                            </p>
                            {pct !== null && (
                              <p className="text-sm text-muted">
                                {off > 0 && `${t(off === 1 ? '1 on leave' : '{n} on leave', { n: off })} · `}
                                {formatPercent(pct)}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-muted">{t('Not held')}</p>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
