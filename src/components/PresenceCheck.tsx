import { useState } from 'react'
import { startCheckpoint } from '../data/sessions'
import { askedInCheck, useCheckins } from '../hooks/useCheckins'
import { useNow } from '../hooks/useSessions'
import { t } from '../lib/i18n'
import type { AttendanceRecord, Session } from '../lib/types'
import { Button, ErrorNote, friendlyError } from './ui'

/**
 * The lecturer's "still here?" control. Opening a check asks every student who has
 * checked in to confirm within three minutes; it is mainly for long online classes.
 */
export function PresenceCheck({ session, records }: { session: Session; records: AttendanceRecord[] }) {
  const now = useNow(1000)
  const checkins = useCheckins(session)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cp = session.checkpoint
  const closes = cp?.expiresAt.toMillis() ?? 0
  const open = cp && closes > now

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      await startCheckpoint(session)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  if (open) {
    const left = Math.max(0, Math.ceil((closes - now) / 1000))
    const asked = records.filter((r) => askedInCheck(r, closes))
    const confirmed = asked.filter((r) => checkins.data?.get(cp.n)?.has(r.studentKey)).length
    return (
      <div className="rounded-lg bg-accent-soft px-4 py-3 ring-1 ring-indigo-200 ring-inset">
        <p className="text-sm font-semibold text-indigo-900">
          {t('Presence check {n} is open', { n: cp.n })}
          <span className="tabular ml-2 font-normal">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        </p>
        <p className="tabular mt-0.5 text-sm text-indigo-900/80">
          {t('{done} of {total} confirmed', { done: confirmed, total: asked.length })}
        </p>
        <p className="mt-1 text-xs text-indigo-900/70">
          {t('Students see an “I’m still here” button on their phone. Ask anyone who closed the page to open the link again.')}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-canvas px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('Still here?')}</p>
          <p className="text-xs text-muted">
            {cp
              ? t('Check {n} has closed. Anyone who did not confirm is marked in the list.', { n: cp.n })
              : t('Ask everyone who checked in to confirm they are still present. Useful in long online classes.')}
          </p>
        </div>
        <Button variant="secondary" busy={busy} disabled={records.length === 0} onClick={start}>
          {cp ? t('Run another check') : t('Run a presence check')}
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  )
}
